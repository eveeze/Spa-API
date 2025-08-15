// src/controller/reservationController.js
import {
  createReservation,
  getReservationById,
  getReservations,
  updateReservationStatus,
  createPayment,
  updatePayment,
  findPaymentByTransactionId,
  getPaymentByReservationId,
  getReservationAnalytics,
  getPaymentById,
  getExpiredPendingPayments,
  getUpcomingReservations,
  updatePaymentProof,
  updateReservationDetails,
} from "../repository/reservationRepository.js";
import {
  getSessionById,
  updateSessionBookingStatus,
} from "../repository/sessionRepository.js";
import { validateAndFormatPhone } from "../utils/paymentUtils.js";
import {
  getPaymentChannels,
  createTransaction,
  getTransactionDetails,
  verifyCallbackSignature,
} from "../utils/tripay.js";
import prisma from "../config/db.js";
import { getServiceById } from "../repository/serviceRepository.js";
import { addHours } from "date-fns";
import {
  createNotificationForAllOwners,
  createNotificationForCustomer,
} from "../services/notificationService.js";
import paymentScheduler from "../config/paymentScheduler.js";
/**
 * Get upcoming reservations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getUpcomingReservationsHandler = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
    };

    // If customer is making request, filter by their ID
    if (req.customer) {
      options.customerId = req.customer.id;
    }

    // If owner is making request and staffId is provided, filter by staff
    // Owners can also see all upcoming reservations if staffId is not provided.
    if (req.owner && req.query.staffId) {
      options.staffId = req.query.staffId;
    }

    const result = await getUpcomingReservations(options);

    return res.status(200).json({
      success: true,
      message: "Upcoming reservations retrieved successfully",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[GET UPCOMING RESERVATIONS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve upcoming reservations",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get upcoming reservations for a specific day for the dashboard
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getUpcomingReservationsForDay = async (req, res) => {
  try {
    const { date, page = 1, limit = 10 } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date query parameter is required (YYYY-MM-DD)",
      });
    }

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Please use YYYY-MM-DD.",
      });
    }

    const startDate = new Date(targetDate);
    startDate.setUTCHours(0, 0, 0, 0); // Start of the day in UTC

    const endDate = new Date(targetDate);
    endDate.setUTCHours(23, 59, 59, 999); // End of the day in UTC

    // Define statuses for "upcoming" that are confirmed or in progress
    // 'PENDING' could be included if manual bookings with cash payment are considered "soft booked"
    const upcomingStatuses = ["CONFIRMED", "IN_PROGRESS"];

    const options = {
      status: upcomingStatuses,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      page: parseInt(page),
      limit: parseInt(limit),
      orderBy: "sessionTime:asc", // Sort by the appointment time
    };

    const result = await getReservations(options); // Using the existing getReservations function

    return res.status(200).json({
      success: true,
      message: `Upcoming reservations for ${date} retrieved successfully`,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[GET UPCOMING RESERVATIONS FOR DAY ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve upcoming reservations",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
const mapTripayMethodToEnum = (tripayCode) => {
  if (!tripayCode) return "BANK_TRANSFER";
  const code = tripayCode.toUpperCase();

  // Semua varian QRIS dari Tripay diterjemahkan menjadi 'QRIS' untuk database kita
  if (code.startsWith("QRIS")) return "QRIS";

  // Semua varian Virtual Account diterjemahkan menjadi 'BANK_TRANSFER'
  if (code.includes("VA")) return "BANK_TRANSFER";

  // Semua varian E-Wallet diterjemahkan menjadi 'E_WALLET'
  if (["OVO", "GOPAY", "DANA", "SHOPEEPAY"].includes(code)) return "E_WALLET";

  console.warn(`[PaymentMapper] Unmapped Tripay code: ${tripayCode}`);
  // Jika tidak ada pemetaan, kita bisa gunakan nilai default atau lempar error
  // Untuk keamanan, kita bisa kembalikan nilai yang kita tahu pasti ada di enum
  return "BANK_TRANSFER";
};

/**
 * Create a new reservation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createNewReservation = async (req, res) => {
  const {
    serviceId,
    sessionId,
    babyName,
    babyAge,
    priceTierId,
    notes,
    paymentMethod,
  } = req.body;

  try {
    // ---- 1. VALIDASI INPUT & PERSIAPAN DATA ----
    if (!serviceId || !sessionId || !babyName || babyAge === undefined) {
      return res.status(400).json({
        success: false,
        message: "Informasi layanan, sesi, nama dan umur bayi wajib diisi.",
      });
    }
    const age = parseInt(babyAge, 10);
    if (isNaN(age) || age < 0) {
      return res.status(400).json({
        success: false,
        message: "Umur bayi harus dalam format angka yang valid.",
      });
    }

    const [service, session, customer] = await Promise.all([
      getServiceById(serviceId),
      getSessionById(sessionId),
      prisma.customer.findUnique({ where: { id: req.customer.id } }),
    ]);

    if (!service)
      return res
        .status(404)
        .json({ success: false, message: "Layanan tidak ditemukan." });
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Sesi tidak ditemukan." });
    if (session.isBooked)
      return res.status(409).json({
        success: false,
        message: "Sesi ini sudah dipesan. Silakan pilih jadwal lain.",
      });
    if (!customer)
      return res
        .status(404)
        .json({ success: false, message: "Data pelanggan tidak ditemukan." });

    const totalPrice = await calculateTotalPrice({
      serviceId,
      babyAge: age,
      priceTierId,
    });

    // ---- 2. TRANSAKSI DATABASE (menyimpan data awal) ----
    const { reservation, payment } = await prisma.$transaction(async (tx) => {
      const createdReservation = await tx.reservation.create({
        data: {
          customerId: customer.id,
          serviceId,
          staffId: session.staffId,
          sessionId,
          babyName: babyName.trim(),
          babyAge: age,
          priceTierId,
          notes: notes?.trim() || null,
          reservationType: "ONLINE",
          totalPrice,
          status: "PENDING",
        },
      });

      // TERJEMAHKAN kode dari Tripay ke ENUM internal database
      const dbPaymentMethod = mapTripayMethodToEnum(paymentMethod);

      const createdPayment = await tx.payment.create({
        data: {
          reservationId: createdReservation.id,
          amount: totalPrice,
          paymentMethod: dbPaymentMethod,
          paymentStatus: "PENDING",
          expiryDate: addHours(new Date(), 24),
        },
      });

      await tx.session.update({
        where: { id: sessionId },
        data: { isBooked: true },
      });

      return { reservation: createdReservation, payment: createdPayment };
    });

    // ---- 3. INTERAKSI DENGAN PIHAK KETIGA (SETELAH DB SUKSES) ----
    const tripayPaymentData = {
      reservationId: reservation.id,
      customerName: customer.name.trim(),
      customerEmail: customer.email.trim(),
      customerPhone: validateAndFormatPhone(customer.phoneNumber),
      paymentMethod: paymentMethod, // Kirim kode asli ke Tripay
      amount: totalPrice,
      serviceName: service.name,
    };

    const tripayTransaction = await createTransaction(tripayPaymentData);

    // ---- 4. FINALISASI (Update record & kirim notifikasi) ----
    const updatedPayment = await updatePayment(payment.id, {
      transactionId: tripayTransaction.reference,
      tripayPaymentUrl: tripayTransaction.checkout_url,
      tripayResponse: tripayTransaction,
      tripayInstructions: tripayTransaction.instructions || {},
    });

    paymentScheduler.schedulePaymentExpiry(
      updatedPayment.id,
      updatedPayment.expiryDate
    );

    // Notifikasi untuk SEMUA OWNER: Simpan ke DB & Kirim Push
    await createNotificationForAllOwners(
      {
        title: "Reservasi Baru!",
        message: `Pelanggan ${customer.name} telah memesan layanan ${service.name}.`,
        type: "RESERVATION_NEW",
        referenceId: reservation.id,
      },
      { sendPush: true }
    );

    // Notifikasi untuk CUSTOMER: Simpan ke DB & Kirim Email
    const emailContent = `<h1>Halo ${
      customer.name
    },</h1><p>Reservasi Anda untuk layanan <strong>${
      service.name
    }</strong> telah kami terima. Mohon selesaikan pembayaran sebelum ${updatedPayment.expiryDate.toLocaleString(
      "id-ID"
    )}.</p><p>Klik <a href="${
      updatedPayment.tripayPaymentUrl
    }">di sini</a> untuk membayar.</p>`;

    await createNotificationForCustomer(
      {
        recipientId: customer.id,
        title: "Reservasi Menunggu Pembayaran",
        message: `Mohon selesaikan pembayaran untuk reservasi ${service.name}.`,
        type: "RESERVATION_PENDING",
        referenceId: reservation.id,
      },
      { sendEmail: true, emailHtml: emailContent }
    );

    // ---- 5. KIRIM RESPONS SUKSES KE FRONTEND ----
    const responseData = {
      reservation: {
        id: reservation.id,
        status: reservation.status,
        serviceName: service.name,
      },
      payment: {
        id: updatedPayment.id,
        status: updatedPayment.paymentStatus,
        expiryDate: updatedPayment.expiryDate,
        tripayPaymentUrl: updatedPayment.tripayPaymentUrl,
        qrCode: tripayTransaction.qr_string || null,
        instructions: tripayTransaction.instructions || {},
      },
    };

    return res.status(201).json({
      success: true,
      message: "Reservasi berhasil dibuat. Silakan selesaikan pembayaran.",
      data: responseData,
    });
  } catch (error) {
    console.error("[CREATE RESERVATION ERROR]:", error);

    // Handle unique constraint error (P2002) for sessionId specifically
    // This means the session was already booked by another concurrent request
    if (error.code === "P2002" && error.meta?.target?.includes("sessionId")) {
      console.error(
        `[CREATE RESERVATION ERROR] Unique constraint violation on sessionId: ${sessionId}. Session likely booked by another user.`
      );
      // Attempt to rollback the session if it was prematurely marked as booked in case of an earlier error
      // Note: The transaction itself should handle atomicity. This is more of a fallback/cleanup if issues arise.
      if (sessionId) {
        try {
          // Ensure the session is indeed not booked if it was part of this failed transaction attempt
          // This check is a safeguard, as Prisma transaction should roll back if the `create` fails.
          const currentSession = await getSessionById(sessionId);
          if (currentSession && currentSession.isBooked) {
            // Only unbook if this failed reservation was the one that booked it, and it's not confirmed
            const existingReservationForSession =
              await prisma.reservation.findUnique({
                where: { sessionId: sessionId },
                select: {
                  status: true,
                  payment: { select: { paymentStatus: true } },
                },
              });

            // If no reservation exists, or if it's not confirmed/paid, unbook the session
            if (
              !existingReservationForSession ||
              (existingReservationForSession.status !== "CONFIRMED" &&
                existingReservationForSession.payment?.paymentStatus !== "PAID")
            ) {
              await updateSessionBookingStatus(sessionId, false);
              console.log(
                `[ROLLBACK] Session ${sessionId} unbooked due to failed reservation (P2002 error).`
              );
            }
          }
        } catch (rollbackError) {
          console.error(
            `[ROLLBACK FAILED] for session ${sessionId} after P2002:`,
            rollbackError
          );
        }
      }
      return res.status(409).json({
        success: false,
        message:
          "Sesi ini sudah dipesan oleh pengguna lain. Silakan pilih jadwal atau sesi lain.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    // General rollback logic if other errors occur
    if (sessionId) {
      try {
        const sessionToRollback = await getSessionById(sessionId);
        if (sessionToRollback?.isBooked) {
          const associatedReservation = await prisma.reservation.findUnique({
            where: { sessionId },
          });
          if (
            !associatedReservation ||
            associatedReservation.payment?.paymentStatus !== "PAID"
          ) {
            await updateSessionBookingStatus(sessionId, false);
            console.log(
              `[ROLLBACK] Session ${sessionId} has been unbooked due to an error.`
            );
          }
        }
      } catch (rollbackError) {
        console.error(
          `[ROLLBACK FAILED] for session ${sessionId}:`,
          rollbackError
        );
      }
    }

    const statusCode = error.message.includes("already booked") ? 409 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Gagal membuat reservasi.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get reservations with filters
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getFilteredReservations = async (req, res) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

    // Determine user role and ID for filtering
    const isOwner = !!req.owner;
    const isCustomer = !!req.customer;

    const options = {
      status,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit),
    };

    // If customer is making request, filter by their ID
    if (isCustomer) {
      options.customerId = req.customer.id;
    }

    // If staff ID is provided and request is from owner, filter by staff
    if (req.query.staffId && isOwner) {
      options.staffId = req.query.staffId;
    }

    // Get filtered reservations
    const result = await getReservations(options);

    return res.status(200).json({
      success: true,
      message: "Reservations retrieved successfully",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[GET RESERVATIONS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve reservations",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get reservation by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getReservation = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await getReservationById(id);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Check authorization - owner can see all, customer can only see their own
    if (req.customer && reservation.customerId !== req.customer.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this reservation",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Reservation retrieved successfully",
      data: reservation,
    });
  } catch (error) {
    console.error("[GET RESERVATION ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve reservation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Update reservation status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = [
      "CONFIRMED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be one of: " + validStatuses.join(", "),
      });
    }

    // Get reservation
    const reservation = await getReservationById(id);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Validate status transition
    if (!isValidStatusTransition(reservation.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${reservation.status} to ${status}`,
      });
    }

    // Update reservation status
    const updatedReservation = await updateReservationStatus(id, status);

    // KODE BARU
    if (status === "CANCELLED") {
      await updateSessionBookingStatus(reservation.sessionId, false);

      const emailContent = `<h1>Reservasi Dibatalkan</h1><p>Dengan hormat, kami memberitahukan bahwa reservasi Anda untuk layanan <strong>${
        reservation.service.name
      }</strong> dengan ID #${reservation.id.substring(
        0,
        8
      )} telah dibatalkan. Silakan hubungi kami untuk informasi lebih lanjut.</p>`;

      await createNotificationForCustomer(
        {
          recipientId: reservation.customerId,
          title: "Reservasi Anda Dibatalkan",
          message: `Reservasi Anda untuk ${reservation.service.name} telah dibatalkan oleh pihak kami.`,
          type: "RESERVATION_CANCELLED_MANUAL",
          referenceId: reservation.id,
        },
        { sendEmail: true, emailHtml: emailContent }
      );
    }

    if (status === "COMPLETED") {
      const emailContent = `<h1>Terima Kasih, ${reservation.customer.name}!</h1><p>Layanan <strong>${reservation.service.name}</strong> Anda telah selesai. Kami harap Anda dan si kecil menikmati pengalamannya. Kami akan sangat menghargai jika Anda bersedia memberikan ulasan untuk layanan kami.</p>`;

      await createNotificationForCustomer(
        {
          recipientId: reservation.customerId,
          title: "Layanan Telah Selesai",
          message: `Terima kasih! Layanan ${reservation.service.name} Anda telah selesai.`,
          type: "RESERVATION_COMPLETED",
          referenceId: reservation.id,
        },
        { sendEmail: true, emailHtml: emailContent }
      );
    }
    return res.status(200).json({
      success: true,
      message: "Reservation status updated successfully",
      data: updatedReservation,
    });
  } catch (error) {
    console.error("[UPDATE RESERVATION ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update reservation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
/**
 * Update reservation details (name, age, notes, etc.)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateReservationDetailsHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { customerName, babyName, babyAge, parentNames, notes } = req.body;

    // Separate data for reservation and customer models
    const reservationUpdateData = {};
    const customerUpdateData = {};

    if (babyName !== undefined) reservationUpdateData.babyName = babyName;
    if (parentNames !== undefined)
      reservationUpdateData.parentNames = parentNames;
    if (notes !== undefined) reservationUpdateData.notes = notes;
    if (babyAge !== undefined) {
      const age = parseInt(babyAge, 10);
      if (isNaN(age)) {
        return res.status(400).json({
          success: false,
          message: "Baby age must be a valid number.",
        });
      }
      reservationUpdateData.babyAge = age;
    }

    if (customerName !== undefined) customerUpdateData.name = customerName;

    // Call the repository function with the separated data
    const updatedReservation = await updateReservationDetails(
      id,
      reservationUpdateData,
      customerUpdateData
    );

    return res.status(200).json({
      success: true,
      message: "Reservation updated successfully",
      data: updatedReservation,
    });
  } catch (error) {
    console.error("[UPDATE RESERVATION DETAILS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update reservation details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * handlePaymentCallback - VERSI FINAL YANG DIOPTIMALKAN
 * Merespons callback dari Tripay dengan cepat untuk menghindari timeout,
 * dan menjalankan tugas yang lama (notifikasi) di latar belakang.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handlePaymentCallback = async (req, res) => {
  // Log penanda callback diterima
  console.log(
    `[CALLBACK_START] Received callback for ref: ${
      req.body?.reference
    } at ${new Date().toISOString()}`
  );

  try {
    const callbackData = req.body;
    if (!callbackData || !callbackData.reference || !callbackData.status) {
      console.error(
        "[CALLBACK_VALIDATION_ERROR] Invalid callback data: missing reference or status."
      );
      return res
        .status(400)
        .json({ success: false, message: "Invalid callback data" });
    }

    const { reference, status, fee_merchant } = callbackData;
    console.log(
      `[CALLBACK_PROCESSING] Processing: Ref: ${reference}, Status: ${status}`
    );

    // Verifikasi signature di mode produksi
    if (process.env.NODE_ENV === "production") {
      if (!verifyCallbackSignature(callbackData)) {
        console.error(
          `[CALLBACK_SIGNATURE_ERROR] Signature verification failed for ref: ${reference}`
        );
        // Kirim 200 OK agar Tripay tidak retry, tapi log sebagai error internal
        return res.status(200).json({
          success: false,
          message: "Invalid signature but callback acknowledged",
        });
      }
    } else {
      console.log(
        `[CALLBACK_INFO] Skipping signature verification in dev mode for ref: ${reference}`
      );
    }

    // --- Operasi Database ---
    console.log(`[CALLBACK_DB_FIND] Finding payment for ref: ${reference}`);
    const payment = await findPaymentByTransactionIdWithFullData(reference);

    if (!payment) {
      console.error(
        `[CALLBACK_DB_ERROR] Payment not found for ref: ${reference}`
      );
      // Balas 200 OK agar Tripay berhenti mengirim callback untuk referensi yang tidak ada
      return res.status(200).json({
        success: false,
        message: "Payment not found but callback acknowledged",
      });
    }
    console.log(
      `[CALLBACK_DB_FIND_DONE] Payment found for ref: ${reference}. Current status: ${payment.paymentStatus}`
    );

    // Idempotency Check: Jangan proses ulang jika status bukan PENDING
    if (payment.paymentStatus !== "PENDING") {
      console.log(
        `[CALLBACK_ALREADY_PROCESSED] Ref: ${reference}, not processing again.`
      );
      return res
        .status(200)
        .json({ success: true, message: "Payment already processed" });
    }

    // Tentukan status baru berdasarkan callback
    let newPaymentStatus = payment.paymentStatus;
    let newReservationStatus = payment.reservation.status;
    let shouldFreeSession = false;

    switch (status.toUpperCase()) {
      case "PAID":
        paymentScheduler.cancelPaymentExpiry(payment.id);
        newPaymentStatus = "PAID";
        newReservationStatus = "CONFIRMED";
        break;
      case "EXPIRED":
        paymentScheduler.cancelPaymentExpiry(payment.id);
        newPaymentStatus = "EXPIRED";
        newReservationStatus = "EXPIRED";
        shouldFreeSession = true;
        break;
      case "FAILED":
      case "REFUND":
        paymentScheduler.cancelPaymentExpiry(payment.id);
        newPaymentStatus = status.toUpperCase();
        newReservationStatus = "CANCELLED";
        shouldFreeSession = true;
        break;
      default:
        console.log(
          `[CALLBACK_INFO] Unhandled status for ref ${reference}: ${status}`
        );
        break;
    }

    // Bebaskan sesi jika pembayaran gagal/expired/refund
    if (shouldFreeSession) {
      console.log(`[CALLBACK_SESSION] Freeing session for ref: ${reference}`);
      await updateSessionBookingStatus(
        payment.reservation.sessionId,
        false
      ).catch((err) => {
        console.error(
          `[CALLBACK_SESSION_ERROR] Failed to free session for ref ${reference}:`,
          err
        );
      });
    }

    // Lakukan update ke database jika ada perubahan status
    if (newPaymentStatus !== payment.paymentStatus) {
      console.log(
        `[CALLBACK_DB_UPDATE] Updating status for ref: ${reference} to ${newPaymentStatus}`
      );
      await updatePayment(payment.id, {
        paymentStatus: newPaymentStatus,
        paymentDate: newPaymentStatus === "PAID" ? new Date() : null,
        tripayResponse: callbackData,
        merchantFee: fee_merchant ? parseFloat(fee_merchant) : null,
      });

      await updateReservationStatus(
        payment.reservation.id,
        newReservationStatus
      );
      console.log(
        `[CALLBACK_DB_UPDATE_DONE] DB update finished for ref: ${reference}`
      );

      // --- NOTIFIKASI BARU (MENGGANTIKAN YANG LAMA) ---
      console.log(
        `[CALLBACK_NOTIFICATION] Dispatching notifications for ref: ${reference}`
      );
      const serviceName = payment.reservation.service?.name || "layanan";
      const customerId = payment.reservation.customer.id;
      const customerEmail = payment.reservation.customer.email;
      const reservationId = payment.reservation.id;

      if (newReservationStatus === "CONFIRMED") {
        await createNotificationForAllOwners(
          {
            title: `Pembayaran Lunas`,
            message: `Pembayaran untuk ${serviceName} dari ${customer.name} telah dikonfirmasi.`,
            type: "PAYMENT_SUCCESS",
            referenceId: reservationId,
          },
          { sendPush: true }
        );

        // Notifikasi untuk CUSTOMER
        await createNotificationForCustomer(
          {
            recipientId: customer.id, // Langsung pakai ID customer
            title: "Pembayaran Berhasil!",
            message: `Reservasi Anda untuk ${serviceName} telah dikonfirmasi. Sampai jumpa!`,
            type: "PAYMENT_SUCCESS",
            referenceId: reservationId,
          },
          { sendPush: true }
        );
      } else if (["EXPIRED", "CANCELLED"].includes(newReservationStatus)) {
        const emailContent = `<h1>Halo,</h1><p>Reservasi Anda untuk layanan <strong>${serviceName}</strong> (ID: ${reservationId}) telah dibatalkan karena status pembayaran: ${status}.</p>`;

        await createNotificationForCustomer(
          {
            recipientId: customerId,
            title: "Reservasi Dibatalkan",
            message: `Reservasi Anda untuk ${serviceName} telah dibatalkan.`,
            type: "RESERVATION_CANCELLED_AUTO",
            referenceId: reservationId,
          },
          { sendEmail: true, emailHtml: emailContent }
        );
      }
    }

    // Kirim respons sukses secepatnya ke Tripay
    console.log(`[CALLBACK_SUCCESS] Responding 200 OK for ref: ${reference}.`);
    return res.status(200).json({
      success: true,
      message: "Callback processed successfully",
    });
  } catch (error) {
    console.error(
      `[CALLBACK_FATAL_ERROR] for ref: ${req.body?.reference}:`,
      error
    );
    // Jika terjadi error fatal, tetap balas 200 OK agar Tripay tidak mengulang,
    // tapi catat error ini di sistem monitoring Anda (Sentry, New Relic, dll.)
    return res.status(200).json({
      success: false,
      message:
        "An internal server error occurred, but callback was acknowledged.",
    });
  }
};

export const findPaymentByTransactionIdWithFullData = async (transactionId) => {
  try {
    const payment = await prisma.payment.findFirst({
      where: { transactionId },
      include: {
        reservation: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
            service: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
            // PERBAIKAN UTAMA: Gunakan include bertingkat untuk mengambil data sesi
            session: {
              include: {
                timeSlot: {
                  include: {
                    operatingSchedule: true, // Ini akan mengambil tanggal dari jadwal operasi
                  },
                },
              },
            },
          },
        },
      },
    });

    return payment;
  } catch (error) {
    console.error(
      "[DATABASE ERROR] findPaymentByTransactionIdWithFullData:",
      error
    );
    throw error;
  }
};
/**
 * Get payment details for a reservation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getPaymentDetails = async (req, res) => {
  try {
    const { reservationId } = req.params;

    // Get reservation details
    const reservation = await getReservationById(reservationId);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Check authorization - owner can see all, customer can only see their own
    if (req.customer && reservation.customerId !== req.customer.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this payment",
      });
    }

    // Get payment details
    const payment = await getPaymentByReservationId(reservationId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found for this reservation",
      });
    }

    // PERUBAHAN: Enhanced Tripay status check dengan retry
    if (payment.paymentStatus === "PENDING" && payment.transactionId) {
      try {
        const tripayDetails = await getTransactionDetails(
          payment.transactionId
        );

        // Update payment status if it has changed
        if (tripayDetails.status !== payment.paymentStatus) {
          let newPaymentStatus;
          let newReservationStatus = reservation.status;

          switch (tripayDetails.status) {
            case "PAID":
              newPaymentStatus = "PAID";
              newReservationStatus = "CONFIRMED";
              break;
            case "EXPIRED":
              newPaymentStatus = "EXPIRED";
              newReservationStatus = "EXPIRED";
              break;
            case "FAILED":
              newPaymentStatus = "FAILED";
              newReservationStatus = "CANCELLED";
              break;
            case "REFUND":
              newPaymentStatus = "REFUNDED";
              newReservationStatus = "CANCELLED";
              break;
            default:
              newPaymentStatus = payment.paymentStatus;
          }

          // Update payment in database
          if (newPaymentStatus !== payment.paymentStatus) {
            const updateData = {
              paymentStatus: newPaymentStatus,
              paymentDate: newPaymentStatus === "PAID" ? new Date() : null,
              tripayResponse: tripayDetails,
            };

            // BARU: Store additional Tripay data
            if (tripayDetails.fee_merchant) {
              updateData.merchantFee = parseFloat(tripayDetails.fee_merchant);
            }

            await updatePayment(payment.id, updateData);

            // Update payment object for response
            payment.paymentStatus = newPaymentStatus;
            payment.paymentDate =
              newPaymentStatus === "PAID" ? new Date() : null;
            payment.tripayResponse = tripayDetails;
            payment.merchantFee = updateData.merchantFee;
          }

          // Update reservation status if needed
          if (newReservationStatus !== reservation.status) {
            await updateReservationStatus(reservationId, newReservationStatus);
            reservation.status = newReservationStatus;
          }
        }
      } catch (error) {
        console.error("[GET TRIPAY TRANSACTION DETAILS ERROR]:", error);

        // BARU: Don't fail the request if Tripay check fails, just log it
        console.warn(
          "[TRIPAY STATUS CHECK] Failed to get latest status for transaction:",
          payment.transactionId
        );
      }
    }

    // PERUBAHAN: Enhanced response dengan additional data
    return res.status(200).json({
      success: true,
      message: "Payment details retrieved successfully",
      data: {
        payment: {
          id: payment.id,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          status: payment.paymentStatus,
          transactionId: payment.transactionId,
          paymentDate: payment.paymentDate,
          expiryDate: payment.expiryDate,
          paymentProof: payment.paymentProof,
          paymentUrl: payment.tripayPaymentUrl,
          merchantFee: payment.merchantFee || null,
          qrCode: payment.tripayResponse?.qr_string || null,
          instructions: payment.tripayInstructions || {},
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
        reservation: {
          id: reservation.id,
          status: reservation.status,
          serviceName: reservation.service.name,
          serviceId: reservation.serviceId,
          customerName: reservation.customer.name,
          customerId: reservation.customerId,
          sessionDate: reservation.session.timeSlot.operatingSchedule.date,
          sessionTime: `${formatTime(
            reservation.session.timeSlot.startTime
          )} - ${formatTime(reservation.session.timeSlot.endTime)}`,
          staffName: reservation.staff.name,
          totalPrice: reservation.totalPrice,
        },
      },
    });
  } catch (error) {
    console.error("[GET PAYMENT DETAILS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payment details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const testTripayIntegration = async (req, res) => {
  try {
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        success: false,
        message: "This endpoint is only available in development mode",
      });
    }

    const testResult = await testTripayConnection();

    if (testResult) {
      const channels = await getPaymentChannels();

      return res.status(200).json({
        success: true,
        message: "Tripay integration test successful",
        data: {
          connectionStatus: "OK",
          mode: process.env.TRIPAY_MODE,
          availableChannels: channels.length,
          channels: channels.map((c) => ({
            code: c.code,
            name: c.name,
            active: c.active,
          })),
        },
      });
    } else {
      return res.status(503).json({
        success: false,
        message: "Tripay integration test failed",
        data: {
          connectionStatus: "FAILED",
          mode: process.env.TRIPAY_MODE,
        },
      });
    }
  } catch (error) {
    console.error("[TRIPAY TEST ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to test Tripay integration",
      error: error.message,
    });
  }
};

/**
 * Get payment methods from Tripay
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getAvailablePaymentMethods = async (req, res) => {
  try {
    // BARU: Test connection first if in development
    if (process.env.NODE_ENV === "development") {
      const connectionTest = await testTripayConnection();
      if (!connectionTest) {
        return res.status(503).json({
          success: false,
          message: "Payment service temporarily unavailable",
          error: "Tripay connection test failed",
        });
      }
    }

    // PERUBAHAN: Menggunakan retry logic yang sudah ada di utils
    const paymentChannels = await getPaymentChannels(3); // 3 retries

    // BARU: Filter dan format response
    const formattedChannels = paymentChannels
      .filter((channel) => channel.active) // Hanya yang aktif
      .map((channel) => ({
        code: channel.code,
        name: channel.name,
        type: channel.type,
        fee: {
          flat: channel.fee_flat,
          percent: channel.fee_percent,
        },
        iconUrl: channel.icon_url,
        minimumAmount: channel.minimum_fee || 0,
        maximumAmount: channel.maximum_fee || null,
      }));

    return res.status(200).json({
      success: true,
      message: "Payment methods retrieved successfully",
      data: formattedChannels,
    });
  } catch (error) {
    console.error("[GET PAYMENT METHODS ERROR]:", error);

    // BARU: Better error response based on error type
    const isNetworkError =
      error.message.includes("ECONNABORTED") ||
      error.message.includes("timeout");

    return res.status(isNetworkError ? 503 : 500).json({
      success: false,
      message: isNetworkError
        ? "Payment service temporarily unavailable"
        : "Failed to retrieve payment methods",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Create manual reservation by owner (for walk-in customers without accounts)
 * FIXED VERSION - Properly handles payment status and reservation status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createManualReservation = async (req, res) => {
  try {
    console.log("[MANUAL RESERVATION] Starting creation with data:", req.body);

    const {
      // Customer info dari form WhatsApp
      customerName,
      customerPhone,
      customerAddress,
      customerInstagram,
      // Baby info
      babyName,
      babyAge,
      // Parent info
      parentNames, // "Nama Ayah & Ibu"
      // Service info
      serviceId,
      sessionId, // PENTING: Harus menggunakan session yang sudah ada
      priceTierId,
      notes,
      // Payment info
      paymentMethod = "CASH", // Default untuk manual booking
      isPaid = false, // IMPORTANT: Default should be false
      paymentNotes, // Catatan pembayaran tambahan
    } = req.body;

    // Convert isPaid to boolean explicitly (handle string inputs)
    const isPaymentPaid =
      isPaid === true || isPaid === "true" || isPaid === 1 || isPaid === "1";

    console.log("[MANUAL RESERVATION] Payment status:", {
      originalIsPaid: isPaid,
      convertedIsPaid: isPaymentPaid,
      type: typeof isPaid,
    });

    // VALIDASI INPUT WAJIB - dengan logging yang lebih detail
    if (!customerName) {
      console.error("[MANUAL RESERVATION] Missing customerName");
      return res.status(400).json({
        success: false,
        message: "Customer name is required",
      });
    }

    if (!customerPhone) {
      console.error("[MANUAL RESERVATION] Missing customerPhone");
      return res.status(400).json({
        success: false,
        message: "Customer phone is required",
      });
    }

    if (!babyName) {
      console.error("[MANUAL RESERVATION] Missing babyName");
      return res.status(400).json({
        success: false,
        message: "Baby name is required",
      });
    }

    if (babyAge === undefined || babyAge === null) {
      console.error("[MANUAL RESERVATION] Missing babyAge");
      return res.status(400).json({
        success: false,
        message: "Baby age is required",
      });
    }

    if (!serviceId) {
      console.error("[MANUAL RESERVATION] Missing serviceId");
      return res.status(400).json({
        success: false,
        message: "Service ID is required",
      });
    }

    if (!sessionId) {
      console.error("[MANUAL RESERVATION] Missing sessionId");
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    console.log("[MANUAL RESERVATION] All required fields validated");

    // VALIDASI SESSION - dengan error handling yang lebih baik
    console.log("[MANUAL RESERVATION] Fetching session:", sessionId);
    const session = await getSessionById(sessionId);

    if (!session) {
      console.error("[MANUAL RESERVATION] Session not found:", sessionId);
      return res.status(404).json({
        success: false,
        message: "Session not found",
        details: `Session with ID ${sessionId} does not exist`,
      });
    }

    console.log("[MANUAL RESERVATION] Session found:", {
      id: session.id,
      isBooked: session.isBooked,
      staffId: session.staffId,
    });

    if (session.isBooked) {
      console.error("[MANUAL RESERVATION] Session already booked:", sessionId);
      return res.status(400).json({
        success: false,
        message:
          "Session is already booked. Please select an available session.",
      });
    }

    // VALIDASI SERVICE - pastikan service ada dan valid
    console.log("[MANUAL RESERVATION] Fetching service:", serviceId);
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        priceTiers: true,
      },
    });

    if (!service) {
      console.error("[MANUAL RESERVATION] Service not found:", serviceId);
      return res.status(404).json({
        success: false,
        message: "Service not found",
        details: `Service with ID ${serviceId} does not exist`,
      });
    }

    console.log("[MANUAL RESERVATION] Service found:", {
      id: service.id,
      name: service.name,
      hasPriceTiers: service.hasPriceTiers,
      priceTiersCount: service.priceTiers?.length || 0,
    });

    // VALIDASI STAFF - pastikan staff dari session ada
    console.log("[MANUAL RESERVATION] Fetching staff:", session.staffId);
    const staff = await prisma.staff.findUnique({
      where: { id: session.staffId },
    });

    if (!staff) {
      console.error("[MANUAL RESERVATION] Staff not found:", session.staffId);
      return res.status(404).json({
        success: false,
        message: "Staff not found",
        details: `Staff with ID ${session.staffId} does not exist`,
      });
    }

    console.log("[MANUAL RESERVATION] Staff found:", {
      id: staff.id,
      name: staff.name,
    });

    // HITUNG TOTAL PRICE - dengan error handling
    console.log("[MANUAL RESERVATION] Calculating price for:", {
      serviceId,
      babyAge,
      priceTierId,
    });

    let totalPrice;
    try {
      totalPrice = await calculateTotalPrice({
        serviceId,
        babyAge,
        priceTierId,
      });
      console.log("[MANUAL RESERVATION] Price calculated:", totalPrice);
    } catch (priceError) {
      console.error(
        "[MANUAL RESERVATION] Price calculation error:",
        priceError
      );
      return res.status(400).json({
        success: false,
        message: "Failed to calculate price",
        error: priceError.message,
      });
    }

    // BUAT ATAU CARI CUSTOMER - dengan validasi phone number
    console.log("[MANUAL RESERVATION] Finding or creating customer");
    let customer;
    try {
      // Validate and format phone number
      const formattedPhone = validateAndFormatPhone(customerPhone);

      customer = await findOrCreateManualCustomer({
        name: customerName.trim(),
        phone: formattedPhone,
        address: customerAddress?.trim(),
        instagram: customerInstagram?.trim(),
      });

      console.log("[MANUAL RESERVATION] Customer processed:", {
        id: customer.id,
        name: customer.name,
        phone: customer.phoneNumber,
      });
    } catch (customerError) {
      console.error(
        "[MANUAL RESERVATION] Customer creation error:",
        customerError
      );
      return res.status(400).json({
        success: false,
        message: "Failed to process customer data",
        error: customerError.message,
      });
    }

    // DETERMINE RESERVATION STATUS BASED ON PAYMENT
    let reservationStatus;
    if (isPaymentPaid) {
      reservationStatus = "CONFIRMED"; // Jika sudah bayar, langsung confirmed
    } else {
      reservationStatus = "PENDING"; // Jika belum bayar, pending
    }

    console.log("[MANUAL RESERVATION] Reservation status determined:", {
      isPaymentPaid,
      reservationStatus,
    });

    if (notes && notes.length > 500) {
      throw new Error("Notes cannot exceed 500 characters");
    }

    const formattedNotes = [
      `Booking Manual Owner`,
      ...(parentNames ? [`Nama Orang Tua: ${parentNames}`] : []),
      ...(customerAddress ? [`Alamat: ${customerAddress}`] : []),
      ...(customerInstagram ? [`Instagram: ${customerInstagram}`] : []),
      ...(notes ? [notes] : []),
    ];

    // PREPARE RESERVATION DATA
    const reservationData = {
      customerId: customer.id,
      serviceId,
      staffId: session.staffId,
      sessionId,
      babyName: babyName.trim(),
      babyAge: parseInt(babyAge), // Ensure it's a number
      priceTierId: priceTierId || null,
      parentNames: parentNames?.trim() || null, // Store parent names in the field
      notes: formattedNotes.join("\n") || null,
      reservationType: "MANUAL",
      createdByOwner: true,
      status: reservationStatus, // Use the determined status
      totalPrice,
    };

    console.log(
      "[MANUAL RESERVATION] Creating reservation with data:",
      reservationData
    );

    // DETERMINE PAYMENT STATUS
    let paymentStatus;
    let paymentDate = null;

    if (isPaymentPaid) {
      paymentStatus = "PAID";
      paymentDate = new Date();
    } else {
      paymentStatus = "PENDING";
    }

    console.log("[MANUAL RESERVATION] Payment status determined:", {
      paymentStatus,
      paymentDate,
    });

    // TRANSACTION: Create reservation and update session
    const result = await prisma.$transaction(async (tx) => {
      // Create reservation
      const reservation = await tx.reservation.create({
        data: reservationData,
        include: {
          customer: true,
          service: true,
          staff: true,
          session: {
            include: {
              timeSlot: {
                include: {
                  operatingSchedule: true,
                },
              },
            },
          },
        },
      });

      // Update session booking status
      await tx.session.update({
        where: { id: sessionId },
        data: { isBooked: true },
      });

      // Create payment record
      const paymentData = {
        reservationId: reservation.id,
        amount: totalPrice,
        paymentMethod: paymentMethod.toUpperCase(),
        expiryDate: isPaymentPaid
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now for paid
          : new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours for unpaid
        notes: paymentNotes?.trim() || null,
        paymentStatus: paymentStatus,
        paymentDate: paymentDate,
      };

      // Add payment proof if uploaded
      if (req.paymentProofUrl) {
        paymentData.paymentProof = req.paymentProofUrl;
      }

      console.log(
        "[MANUAL RESERVATION] Creating payment with data:",
        paymentData
      );

      const payment = await tx.payment.create({
        data: paymentData,
      });

      return { reservation, payment };
    });

    console.log("[MANUAL RESERVATION] Transaction completed successfully");
    console.log("[MANUAL RESERVATION] Final statuses:", {
      reservationStatus: result.reservation.status,
      paymentStatus: result.payment.paymentStatus,
      isPaidInput: isPaid,
      isPaymentPaidProcessed: isPaymentPaid,
    });

    // PREPARE RESPONSE DATA
    const responseData = {
      reservation: {
        id: result.reservation.id,
        customerId: result.reservation.customerId,
        serviceId: result.reservation.serviceId,
        staffId: result.reservation.staffId,
        sessionId: result.reservation.sessionId,
        babyName: result.reservation.babyName,
        babyAge: result.reservation.babyAge,
        parentNames: result.reservation.parentNames,
        totalPrice: result.reservation.totalPrice,
        status: result.reservation.status,
        reservationType: result.reservation.reservationType,
        createdAt: result.reservation.createdAt,
        sessionInfo: {
          date: result.reservation.session.timeSlot.operatingSchedule.date,
          startTime: result.reservation.session.timeSlot.startTime,
          endTime: result.reservation.session.timeSlot.endTime,
          staffName: result.reservation.staff.name,
          serviceName: result.reservation.service.name,
        },
      },
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phoneNumber,
      },
      payment: {
        id: result.payment.id,
        amount: result.payment.amount,
        paymentMethod: result.payment.paymentMethod,
        status: result.payment.paymentStatus,
        paymentProof: result.payment.paymentProof,
        paymentDate: result.payment.paymentDate,
        expiryDate: result.payment.expiryDate,
        reservationId: result.payment.reservationId, // Also good to include
        createdAt: result.payment.createdAt,
        updatedAt: result.payment.updatedAt,
      },
    };

    console.log(
      "[MANUAL RESERVATION] Sending success response with final data:",
      {
        reservationStatus: responseData.reservation.status,
        paymentStatus: responseData.payment.status,
      }
    );

    return res.status(201).json({
      success: true,
      message: "Manual reservation created successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("[MANUAL RESERVATION ERROR]:", {
      message: error.message,
      stack: error.stack,
      sessionId: req.body?.sessionId,
      serviceId: req.body?.serviceId,
    });

    // ROLLBACK: Free session if something goes wrong
    if (req.body?.sessionId) {
      try {
        console.log(
          "[MANUAL RESERVATION] Rolling back session:",
          req.body.sessionId
        );
        await updateSessionBookingStatus(req.body.sessionId, false);
      } catch (rollbackError) {
        console.error("[MANUAL RESERVATION ROLLBACK ERROR]:", rollbackError);
      }
    }

    // Return detailed error in development, generic in production
    const isDevelopment = process.env.NODE_ENV === "development";

    return res.status(500).json({
      success: false,
      message: "Failed to create manual reservation",
      error: isDevelopment ? error.message : "Internal server error",
      details: isDevelopment
        ? {
            stack: error.stack,
            requestData: req.body,
          }
        : undefined,
    });
  }
};

// Helper function untuk format date (jika belum ada)
const formatDate = (date) => {
  if (!date) return "N/A";

  try {
    const dateObj = new Date(date);
    return dateObj.toLocaleDateString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (error) {
    console.error("Date formatting error:", error);
    return date.toString();
  }
};

// IMPROVED: findOrCreateManualCustomer dengan validasi lebih baik
const findOrCreateManualCustomer = async (customerData) => {
  const { name, phone, address, instagram } = customerData;

  console.log("[FIND_OR_CREATE_CUSTOMER] Processing:", { name, phone });

  try {
    // Validate required fields
    if (!name || !phone) {
      throw new Error("Customer name and phone are required");
    }

    // Cari customer berdasarkan nomor telepon
    let customer = await prisma.customer.findFirst({
      where: { phoneNumber: phone },
    });

    if (customer) {
      console.log(
        "[FIND_OR_CREATE_CUSTOMER] Existing customer found:",
        customer.id
      );
      return customer;
    }

    // Generate unique email dengan timestamp dan random string
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const uniqueEmail = `manual_${phone.replace(
      /\D/g,
      ""
    )}_${timestamp}_${randomString}@spa.manual`;

    console.log(
      "[FIND_OR_CREATE_CUSTOMER] Creating new customer with email:",
      uniqueEmail
    );

    customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        email: uniqueEmail,
        phoneNumber: phone,
        password: "manual_booking",
        isVerified: true,
        isManualCustomer: true,
      },
    });

    console.log("[FIND_OR_CREATE_CUSTOMER] New customer created:", customer.id);
    return customer;
  } catch (error) {
    console.error("[FIND_OR_CREATE_CUSTOMER ERROR]:", error);
    throw new Error(`Failed to process customer: ${error.message}`);
  }
};
/**
 * TAMBAHAN: Function untuk update bukti pembayaran pada reservasi manual yang sudah ada
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const uploadManualPaymentProof = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { paymentNotes } = req.body;

    // Validasi upload bukti pembayaran
    if (!req.paymentProofUrl) {
      return res.status(400).json({
        success: false,
        message: "Payment proof file is required",
      });
    }

    // Cek reservasi
    const reservation = await getReservationById(reservationId);
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Validasi bahwa ini adalah reservasi manual
    if (reservation.reservationType !== "MANUAL") {
      return res.status(400).json({
        success: false,
        message: "This endpoint is only for manual reservations",
      });
    }

    // Update payment dengan bukti pembayaran
    const payment = await getPaymentByReservationId(reservationId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    const updatedPayment = await updatePayment(payment.id, {
      paymentProof: req.paymentProofUrl,
      notes: paymentNotes,
      paymentStatus: "PAID", // Anggap sudah dibayar jika owner upload bukti
      paymentDate: new Date(),
    });

    // Update status reservasi menjadi confirmed
    await updateReservationStatus(reservationId, "CONFIRMED");

    return res.status(200).json({
      success: true,
      message: "Payment proof uploaded successfully",
      data: {
        payment: {
          id: updatedPayment.id,
          amount: updatedPayment.amount,
          paymentMethod: updatedPayment.paymentMethod,
          status: updatedPayment.paymentStatus,
          paymentProof: updatedPayment.paymentProof,
          paymentDate: updatedPayment.paymentDate,
          notes: updatedPayment.notes,
        },
        reservation: {
          id: reservation.id,
          status: "CONFIRMED",
          serviceName: reservation.service.name,
        },
      },
    });
  } catch (error) {
    console.error("[UPLOAD MANUAL PAYMENT PROOF ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload payment proof",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
/**
 * Update manual reservation payment status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateManualReservationPayment = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const { paymentMethod = "CASH", notes } = req.body;

    const reservation = await getReservationById(reservationId);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    if (reservation.reservationType !== "MANUAL") {
      return res.status(400).json({
        success: false,
        message: "This endpoint is only for manual reservations",
      });
    }

    // Update payment status
    const payment = await getPaymentByReservationId(reservationId);
    if (payment) {
      await updatePayment(payment.id, {
        paymentStatus: "PAID",
        paymentMethod: paymentMethod.toUpperCase(),
        paymentDate: new Date(),
        notes: notes,
      });
    }

    // Update reservation status
    await updateReservationStatus(reservationId, "CONFIRMED");

    return res.status(200).json({
      success: true,
      message: "Manual reservation payment updated successfully",
    });
  } catch (error) {
    console.error("[UPDATE MANUAL PAYMENT ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update manual reservation payment",
    });
  }
};

/**
 * Create manual payment with proof upload
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createManualPayment = async (req, res) => {
  try {
    const { reservationId } = req.params;

    // Check if payment proof was uploaded
    if (!req.paymentProofUrl) {
      return res.status(400).json({
        success: false,
        message: "Payment proof is required",
      });
    }

    // Get reservation with full details
    const reservation = await getReservationById(reservationId);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Verify ownership
    if (req.customer && reservation.customerId !== req.customer.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this reservation",
      });
    }

    // Validate reservation status - can't add payment for cancelled/expired reservations
    if (["CANCELLED", "EXPIRED"].includes(reservation.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot add payment to a ${reservation.status.toLowerCase()} reservation`,
      });
    }

    // Check if payment already exists
    const existingPayment = await getPaymentByReservationId(reservationId);

    // Get all required data for the transaction record
    const paymentData = {
      amount: reservation.totalPrice,
      paymentMethod: "BANK_TRANSFER",
      paymentStatus: "PENDING", // Owner will need to verify
      paymentProof: req.paymentProofUrl,
      expiryDate: addHours(new Date(), 24), // 24 hours from now
    };

    if (existingPayment) {
      // Validate payment status - can't update already paid payments
      if (existingPayment.paymentStatus === "PAID") {
        return res.status(400).json({
          success: false,
          message: "Payment has already been completed for this reservation",
        });
      }

      // Update existing payment
      const updatedPayment = await updatePayment(
        existingPayment.id,
        paymentData
      );

      return res.status(200).json({
        success: true,
        message: "Payment proof uploaded successfully",
        data: {
          payment: {
            id: updatedPayment.id,
            amount: updatedPayment.amount,
            paymentMethod: updatedPayment.paymentMethod,
            status: updatedPayment.paymentStatus,
            paymentProof: updatedPayment.paymentProof,
            expiryDate: updatedPayment.expiryDate,
            createdAt: updatedPayment.createdAt,
            updatedAt: updatedPayment.updatedAt,
          },
          reservation: {
            id: reservation.id,
            status: reservation.status,
            serviceName: reservation.service.name,
          },
        },
      });
    } else {
      // Create new payment
      const newPayment = await createPayment({
        reservationId,
        ...paymentData,
      });

      return res.status(201).json({
        success: true,
        message: "Payment proof uploaded successfully",
        data: {
          payment: {
            id: newPayment.id,
            amount: newPayment.amount,
            paymentMethod: newPayment.paymentMethod,
            status: newPayment.paymentStatus,
            paymentProof: newPayment.paymentProof,
            expiryDate: newPayment.expiryDate,
            createdAt: newPayment.createdAt,
            updatedAt: newPayment.updatedAt,
          },
          reservation: {
            id: reservation.id,
            status: reservation.status,
            serviceName: reservation.service.name,
          },
        },
      });
    }
  } catch (error) {
    console.error("[MANUAL PAYMENT ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process manual payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
/**
 * Verify manual payment (owner only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const verifyManualPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { isVerified } = req.body;

    // Validate request body
    if (isVerified === undefined) {
      return res.status(400).json({
        success: false,
        message: "isVerified field is required",
      });
    }

    // Get payment using repository function
    const payment = await getPaymentById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Update payment status based on verification
    const paymentStatus = isVerified ? "PAID" : "FAILED";
    const reservationStatus = isVerified ? "CONFIRMED" : "CANCELLED";

    // Update payment
    const updatedPayment = await updatePayment(paymentId, {
      paymentStatus,
      paymentDate: isVerified ? new Date() : null,
    });

    // Update reservation
    const updatedReservation = await updateReservationStatus(
      payment.reservationId,
      reservationStatus
    );

    // If rejected, free up the session
    if (!isVerified) {
      await updateSessionBookingStatus(payment.reservation.sessionId, false);
    }

    return res.status(200).json({
      success: true,
      message: `Payment ${isVerified ? "verified" : "rejected"} successfully`,
      data: {
        payment: updatedPayment,
        reservation: updatedReservation,
      },
    });
  } catch (error) {
    console.error("[VERIFY PAYMENT ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get reservation analytics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    // Get analytics data
    const analytics = await getReservationAnalytics(startDate, endDate);

    return res.status(200).json({
      success: true,
      message: "Analytics retrieved successfully",
      data: analytics,
    });
  } catch (error) {
    console.error("[GET ANALYTICS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve analytics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Helper function untuk validasi status transition
const isValidStatusTransition = (currentStatus, newStatus) => {
  const validTransitions = {
    PENDING_PAYMENT: ["CONFIRMED", "EXPIRED", "CANCELLED"],
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
    EXPIRED: [],
  };

  return validTransitions[currentStatus]?.includes(newStatus);
};

// Helper function to format time
const formatTime = (dateTimeString) => {
  const date = new Date(dateTimeString);
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Helper function to calculate total price
 * @param {Object} params - Parameters for price calculation
 * @param {string} params.serviceId - Service ID
 * @param {number} params.babyAge - Baby age in months
 * @param {string} params.priceTierId - Price tier ID (optional)
 * @returns {Promise<number>} Total price
 */
const calculateTotalPrice = async ({ serviceId, babyAge, priceTierId }) => {
  const service = await getServiceById(serviceId);

  if (service.hasPriceTiers && priceTierId) {
    const priceTier = service.priceTiers.find(
      (tier) => tier.id === priceTierId
    );
    return priceTier ? priceTier.price : service.price;
  }

  return service.price;
};
/**
 * Updates the payment proof for an existing reservation.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateManualPaymentProofHandler = async (req, res) => {
  try {
    const { reservationId } = req.params;

    if (!req.paymentProofUrl) {
      return res.status(400).json({
        success: false,
        message: "New payment proof file is required",
      });
    }

    const reservation = await getReservationById(reservationId);
    if (!reservation || !reservation.payment) {
      return res.status(404).json({
        success: false,
        message: "Reservation or its payment record not found",
      });
    }

    // Update payment proof URL di database dan reset statusnya
    const updatedPayment = await updatePaymentProof(
      reservation.payment.id,
      req.paymentProofUrl
    );

    // Reset status reservasi juga agar konsisten
    await updateReservationStatus(reservationId, "PENDING");

    // Kirim notifikasi ke customer (opsional)
    await notificationService.sendReservationNotification(
      reservation.customerId,
      "Payment Proof Updated",
      `Your payment proof for reservation of ${reservation.service.name} has been updated. Please wait for verification.`,
      "payment",
      reservation.id
    );

    return res.status(200).json({
      success: true,
      message: "Payment proof updated successfully. Waiting for verification.",
      data: {
        payment: updatedPayment,
      },
    });
  } catch (error) {
    console.error("[UPDATE PAYMENT PROOF ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update payment proof",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
/**
 * Confirms a manual reservation by uploading a payment proof.
 * This action marks the payment as PAID and the reservation as CONFIRMED.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const confirmManualWithProofHandler = async (req, res) => {
  try {
    const { reservationId } = req.params;

    if (!req.paymentProofUrl) {
      return res
        .status(400)
        .json({ success: false, message: "Payment proof file is required" });
    }

    const reservation = await getReservationById(reservationId);
    if (!reservation) {
      return res
        .status(404)
        .json({ success: false, message: "Reservation not found" });
    }

    if (
      reservation.reservationType !== "MANUAL" ||
      reservation.status !== "PENDING"
    ) {
      return res.status(400).json({
        success: false,
        message: "This action is only for pending manual reservations.",
      });
    }

    if (!reservation.payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record for this reservation not found",
      });
    }

    // Lakukan update dalam satu transaksi database
    const [updatedPayment, updatedReservation] = await prisma.$transaction([
      // 1. Update Payment
      prisma.payment.update({
        where: { id: reservation.payment.id },
        data: {
          paymentProof: req.paymentProofUrl,
          paymentStatus: "PAID",
          paymentDate: new Date(),
          paymentMethod: "BANK_TRANSFER", // Asumsikan transfer jika ada bukti
        },
      }),
      // 2. Update Reservation
      prisma.reservation.update({
        where: { id: reservationId },
        data: {
          status: "CONFIRMED",
        },
      }),
    ]);

    // Kirim notifikasi (opsional)
    // ...

    return res.status(200).json({
      success: true,
      message: "Reservation confirmed successfully with payment proof.",
      data: {
        payment: updatedPayment,
        reservation: updatedReservation,
      },
    });
  } catch (error) {
    console.error("[CONFIRM WITH PROOF ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to confirm reservation with proof",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
