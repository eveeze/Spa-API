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
import * as notificationService from "../services/notificationService.js";
import paymentScheduler from "../config/paymentScheduler.js";

/**
 * Create a new reservation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createNewReservation = async (req, res) => {
  const transaction = await prisma.$transaction(async (tx) => {
    try {
      const {
        serviceId,
        sessionId,
        babyName,
        babyAge,
        priceTierId,
        notes,
        paymentMethod,
      } = req.body;

      // Validate required fields
      if (!serviceId || !sessionId || !babyName || babyAge === undefined) {
        throw new Error(
          "Missing required fields: serviceId, sessionId, babyName, and babyAge are required"
        );
      }

      // Validasi babyAge
      if (typeof babyAge !== "number" || babyAge < 0) {
        throw new Error("babyAge must be a valid number (0 or greater)");
      }

      // Get service details with transaction
      const service = await tx.service.findUnique({
        where: { id: serviceId },
        include: {
          priceTiers: true,
        },
      });

      if (!service) {
        throw new Error("Service not found");
      }

      // Validate service and price tiers
      if (service.hasPriceTiers) {
        if (!priceTierId) {
          throw new Error(
            "priceTierId is required for services with price tiers"
          );
        }

        const priceTier = service.priceTiers?.find(
          (tier) => tier.id === priceTierId
        );
        if (!priceTier) {
          throw new Error("Invalid priceTierId for this service");
        }

        if (babyAge < priceTier.minBabyAge || babyAge > priceTier.maxBabyAge) {
          throw new Error(
            `Baby age (${babyAge} months) is not within the valid range for selected price tier (${priceTier.minBabyAge}-${priceTier.maxBabyAge} months)`
          );
        }
      } else {
        if (priceTierId) {
          throw new Error(
            "priceTierId should not be provided for services without price tiers"
          );
        }

        if (service.minBabyAge !== null && babyAge < service.minBabyAge) {
          throw new Error(
            `Baby age (${babyAge} months) is below minimum required age (${service.minBabyAge} months) for this service`
          );
        }

        if (service.maxBabyAge !== null && babyAge > service.maxBabyAge) {
          throw new Error(
            `Baby age (${babyAge} months) exceeds maximum allowed age (${service.maxBabyAge} months) for this service`
          );
        }
      }

      if (!service.isActive) {
        throw new Error("Selected service is currently not available");
      }

      // Get session details with atomic check and potential booking
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        include: {
          staff: true,
        },
      });

      if (!session) {
        throw new Error("Session not found");
      }

      // CRITICAL: Check session availability with database lock
      if (session.isBooked) {
        throw new Error("Session is already booked");
      }

      if (!session.staff.isActive) {
        throw new Error("Selected session staff is currently not available");
      }

      // Calculate price
      const totalPrice = await calculateTotalPrice({
        serviceId,
        babyAge,
        priceTierId,
      });

      const reservationData = {
        customerId: req.customer.id,
        serviceId,
        staffId: session.staffId,
        sessionId,
        babyName: babyName.trim(),
        babyAge,
        priceTierId,
        notes: notes?.trim() || null,
        reservationType: "ONLINE",
        totalPrice,
      };

      const reservation = await tx.reservation.create({
        data: reservationData,
        include: {
          customer: true,
          service: true,
          staff: true,
          session: true,
        },
      });

      let paymentData = null;

      if (paymentMethod) {
        // Validate payment method
        const paymentChannels = await getPaymentChannels(2);
        const selectedPaymentMethod = paymentChannels.find(
          (channel) => channel.code === paymentMethod && channel.active
        );

        if (!selectedPaymentMethod) {
          throw new Error("Invalid or inactive payment method");
        }

        const cleanedPhone = validateAndFormatPhone(
          reservation.customer.phoneNumber
        );

        const tripayPaymentData = {
          reservationId: reservation.id,
          customerName: reservation.customer.name.trim(),
          customerEmail: reservation.customer.email.trim(),
          customerPhone: cleanedPhone,
          paymentMethod: paymentMethod,
          amount: totalPrice,
          serviceName: reservation.service.name,
        };

        // Create transaction in Tripay (outside of DB transaction)
        let tripayTransaction;
        try {
          tripayTransaction = await createTransaction(tripayPaymentData);
        } catch (tripayError) {
          console.error("[TRIPAY TRANSACTION ERROR]:", tripayError);

          let errorMessage =
            "Failed to process payment. Please try again later.";
          if (
            tripayError.message.includes("timeout") ||
            tripayError.message.includes("ECONNABORTED")
          ) {
            errorMessage =
              "Payment service is temporarily unavailable. Please try again in a few minutes.";
          } else if (tripayError.message.includes("Invalid payment amount")) {
            errorMessage =
              "Invalid payment amount. Please check your order details.";
          }

          throw new Error(errorMessage);
        }

        const expiryDate = addHours(new Date(), 24);

        // Create payment record within transaction
        const payment = await tx.payment.create({
          data: {
            reservationId: reservation.id,
            amount: reservation.totalPrice,
            paymentMethod: paymentMethod,
            paymentStatus: "PENDING",
            transactionId: tripayTransaction.reference,
            tripayPaymentUrl: tripayTransaction.checkout_url,
            expiryDate: expiryDate,
            tripayResponse: tripayTransaction,
            tripayInstructions: tripayTransaction.instructions || {},
          },
        });

        paymentData = {
          payment,
          tripayTransaction,
          selectedPaymentMethod,
          expiryDate,
        };
      }

      return { reservation, paymentData };
    } catch (error) {
      throw error;
    }
  });

  try {
    const { reservation, paymentData } = await transaction;

    // Schedule payment expiry and send notifications outside of DB transaction
    if (paymentData) {
      const { payment, tripayTransaction, selectedPaymentMethod, expiryDate } =
        paymentData;

      // Schedule payment expiry
      paymentScheduler.schedulePaymentExpiry(payment.id, expiryDate);

      // Send notification
      await notificationService.sendReservationNotification(
        reservation.customer.id,
        "New Reservation - Payment Required",
        `Your reservation for ${reservation.service.name} has been created. Please complete the payment within 24 hours to confirm your booking.`,
        "reservation",
        reservation.id
      );

      return res.status(201).json({
        success: true,
        message:
          "Reservation created successfully. Please complete payment to confirm your booking.",
        data: {
          reservation: {
            ...reservation,
            status: "PENDING_PAYMENT",
          },
          payment: {
            id: payment.id,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            status: payment.paymentStatus,
            expiryDate: payment.expiryDate,
            paymentUrl: tripayTransaction.checkout_url,
            paymentInstructions: tripayTransaction.instructions,
            fee: {
              flat: selectedPaymentMethod.fee_flat || 0,
              percent: selectedPaymentMethod.fee_percent || 0,
            },
            qrCode: tripayTransaction.qr_string || null,
          },
          warning:
            "This reservation is not confirmed until payment is completed. The session slot is not yet reserved.",
        },
      });
    } else {
      return res.status(201).json({
        success: true,
        message:
          "Reservation created successfully. Payment is required to confirm booking.",
        data: {
          ...reservation,
          status: "PENDING_PAYMENT",
          warning:
            "This reservation requires payment to be confirmed. The session slot is not yet reserved.",
        },
      });
    }
  } catch (error) {
    console.error("[CREATE RESERVATION ERROR]:", error);

    // Return appropriate error response
    if (error.message.includes("already booked")) {
      return res.status(409).json({
        success: false,
        message:
          "Session is no longer available. Please select another session.",
      });
    }

    if (error.message.includes("Payment service")) {
      return res.status(503).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message.includes("Invalid payment amount") ||
      error.message.includes("payment method") ||
      error.message.includes("required") ||
      error.message.includes("age")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create reservation",
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

    // If cancelled, free up the session
    if (status === "CANCELLED") {
      await updateSessionBookingStatus(reservation.sessionId, false);

      // Send notification to customer
      await notificationService.sendReservationNotification(
        reservation.customer.id,
        "Reservation Cancelled",
        `Your reservation for ${reservation.service.name} has been cancelled.`,
        "reservation",
        reservation.id
      );
    }

    // If completed, send thank you notification
    if (status === "COMPLETED") {
      await notificationService.sendReservationNotification(
        reservation.customer.id,
        "Service Completed",
        `Thank you for using our service. Your ${reservation.service.name} has been completed.`,
        "reservation",
        reservation.id
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

//  handlePaymentCallback function - FIXED VERSION
export const handlePaymentCallback = async (req, res) => {
  try {
    // Log semua data yang masuk untuk debugging
    console.log(
      "[TRIPAY CALLBACK] Raw request body:",
      JSON.stringify(req.body, null, 2)
    );
    console.log(
      "[TRIPAY CALLBACK] Headers:",
      JSON.stringify(req.headers, null, 2)
    );

    const callbackData = req.body;

    // Validasi basic callback data
    if (!callbackData || typeof callbackData !== "object") {
      console.error("[TRIPAY CALLBACK] Invalid callback data format");
      return res.status(400).json({
        success: false,
        message: "Invalid callback data format",
      });
    }

    // Extract required fields with fallback
    const {
      reference,
      status,
      merchant_ref,
      total_amount,
      fee_merchant,
      signature,
    } = callbackData;

    // Validasi field yang wajib ada
    if (!reference) {
      console.error("[TRIPAY CALLBACK] Missing reference field");
      return res.status(400).json({
        success: false,
        message: "Missing required field: reference",
      });
    }

    if (!status) {
      console.error("[TRIPAY CALLBACK] Missing status field");
      return res.status(400).json({
        success: false,
        message: "Missing required field: status",
      });
    }

    console.log("[TRIPAY CALLBACK] Received callback:", {
      reference,
      status,
      merchant_ref,
      total_amount,
      timestamp: new Date().toISOString(),
    });

    // Verify callback signature - PERBAIKAN: Skip jika dalam development mode
    if (process.env.NODE_ENV === "production") {
      if (!verifyCallbackSignature(callbackData)) {
        console.error("[TRIPAY CALLBACK] Signature verification failed:", {
          reference,
          signature: signature || "missing",
          timestamp: new Date().toISOString(),
        });

        return res.status(400).json({
          success: false,
          message: "Invalid signature",
        });
      }
    } else {
      console.log(
        "[TRIPAY CALLBACK] Skipping signature verification in development mode"
      );
    }

    // PERBAIKAN: Find payment dengan include semua relasi yang dibutuhkan
    const payment = await findPaymentByTransactionIdWithFullData(reference);

    if (!payment) {
      console.error("[TRIPAY CALLBACK] Payment not found:", reference);
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // PERBAIKAN: Validasi struktur data sebelum mengakses nested properties
    if (!payment.reservation) {
      console.error(
        "[TRIPAY CALLBACK] Payment reservation data missing:",
        reference
      );
      return res.status(500).json({
        success: false,
        message: "Invalid payment data structure",
      });
    }

    console.log("[TRIPAY CALLBACK] Found payment:", {
      paymentId: payment.id,
      currentStatus: payment.paymentStatus,
      reservationId: payment.reservation.id,
      amount: payment.amount,
      hasService: !!payment.reservation.service,
      hasCustomer: !!payment.reservation.customer,
    });

    // Validate amount consistency - PERBAIKAN: Handle berbagai format amount
    if (total_amount) {
      const receivedAmount = parseFloat(total_amount);
      const expectedAmount = parseFloat(payment.amount);

      if (
        !isNaN(receivedAmount) &&
        !isNaN(expectedAmount) &&
        receivedAmount !== expectedAmount
      ) {
        console.error("[TRIPAY CALLBACK] Amount mismatch:", {
          reference,
          expectedAmount,
          receivedAmount,
        });

        return res.status(400).json({
          success: false,
          message: "Amount mismatch",
        });
      }
    }

    // Check if payment is already processed to prevent race condition
    if (payment.paymentStatus !== "PENDING") {
      console.log(
        `[TRIPAY CALLBACK] Payment ${reference} already processed with status: ${payment.paymentStatus}`
      );

      // Still return success to acknowledge callback
      return res.status(200).json({
        success: true,
        message: "Payment already processed",
        currentStatus: payment.paymentStatus,
      });
    }

    // Determine new status and actions
    let paymentStatus;
    let reservationStatus = payment.reservation.status;
    let shouldBookSession = false;
    let shouldFreeSession = false;

    switch (status.toUpperCase()) {
      case "PAID":
        // Cancel timer scheduler dulu sebelum yang lain
        const cancelResult = paymentScheduler.cancelPaymentExpiry(payment.id);
        console.log(
          `[TRIPAY CALLBACK] Payment timer cancelled: ${cancelResult}`
        );

        paymentStatus = "PAID";
        reservationStatus = "CONFIRMED";
        shouldBookSession = true;
        break;

      case "EXPIRED":
        // Cancel timer jika ada (mungkin callback datang sebelum timer expire)
        paymentScheduler.cancelPaymentExpiry(payment.id);

        paymentStatus = "EXPIRED";
        reservationStatus = "EXPIRED";
        shouldFreeSession = false; // Session belum pernah di-book
        break;

      case "FAILED":
        // Cancel timer jika ada
        paymentScheduler.cancelPaymentExpiry(payment.id);

        paymentStatus = "FAILED";
        reservationStatus = "CANCELLED";
        shouldFreeSession = false; // Session belum pernah di-book
        break;

      case "REFUND":
        // Cancel timer jika ada
        paymentScheduler.cancelPaymentExpiry(payment.id);

        paymentStatus = "REFUNDED";
        reservationStatus = "CANCELLED";
        // Jika sebelumnya sudah PAID dan di-refund, perlu free session
        if (payment.paymentStatus === "PAID") {
          shouldFreeSession = true;
        }
        break;

      case "UNPAID":
        // Status UNPAID biasanya untuk callback awal, tidak perlu action khusus
        console.log(`[TRIPAY CALLBACK] Payment ${reference} is still unpaid`);
        paymentStatus = "PENDING";
        break;

      default:
        console.warn("[TRIPAY CALLBACK] Unknown status:", status);
        paymentStatus = payment.paymentStatus;
    }

    // Handle session booking logic
    if (shouldBookSession) {
      try {
        // Cek apakah session masih available
        const currentSession = await getSessionById(
          payment.reservation.sessionId
        );

        if (!currentSession) {
          throw new Error("Session not found");
        }

        if (currentSession.isBooked) {
          // Session sudah di-book oleh orang lain, cancel reservation
          console.error(
            "[TRIPAY CALLBACK] Session already booked by another customer:",
            {
              sessionId: payment.reservation.sessionId,
              reference,
            }
          );

          // Update payment dan reservation ke CANCELLED
          await updatePayment(payment.id, {
            paymentStatus: "CANCELLED",
            tripayResponse: callbackData,
            cancelReason: "Session no longer available",
          });

          await updateReservationStatus(payment.reservation.id, "CANCELLED");

          // PERBAIKAN: Validasi customer data sebelum send notification
          if (payment.reservation.customer && payment.reservation.customer.id) {
            const serviceName =
              payment.reservation.service?.name || "Unknown Service";

            await notificationService.sendReservationNotification(
              payment.reservation.customer.id,
              "Reservation Cancelled - Session Unavailable",
              `Sorry, your reservation for ${serviceName} has been cancelled because the session is no longer available. Your payment will be refunded.`,
              "payment",
              payment.reservation.id
            );
          }

          return res.status(200).json({
            success: true,
            message: "Session no longer available, reservation cancelled",
          });
        } else {
          // Book the session
          await updateSessionBookingStatus(payment.reservation.sessionId, true);
          console.log(
            `[TRIPAY CALLBACK] Session ${payment.reservation.sessionId} booked successfully`
          );
        }
      } catch (sessionError) {
        console.error(`[TRIPAY CALLBACK] Session booking error:`, sessionError);

        // Fallback: masih update payment tapi tambahkan warning
        console.warn(
          `[TRIPAY CALLBACK] Payment ${reference} marked as PAID but session booking failed`
        );
      }
    }

    // Handle session freeing logic
    if (shouldFreeSession) {
      try {
        await updateSessionBookingStatus(payment.reservation.sessionId, false);
        console.log(
          `[TRIPAY CALLBACK] Session ${payment.reservation.sessionId} freed successfully`
        );
      } catch (sessionError) {
        console.error(`[TRIPAY CALLBACK] Session freeing error:`, sessionError);
      }
    }

    // Update payment
    const updateData = {
      paymentStatus,
      paymentDate: paymentStatus === "PAID" ? new Date() : null,
      tripayResponse: callbackData,
    };

    if (fee_merchant) {
      updateData.merchantFee = parseFloat(fee_merchant);
    }

    await updatePayment(payment.id, updateData);

    // Update reservation status
    if (reservationStatus !== payment.reservation.status) {
      await updateReservationStatus(payment.reservation.id, reservationStatus);

      // PERBAIKAN: Validasi data sebelum send notifications
      const hasCustomer =
        payment.reservation.customer && payment.reservation.customer.id;
      const serviceName =
        payment.reservation.service?.name || "Unknown Service";

      if (hasCustomer) {
        // Send appropriate notifications
        if (reservationStatus === "CONFIRMED") {
          await notificationService.sendReservationNotification(
            payment.reservation.customer.id,
            "Payment Confirmed - Booking Confirmed",
            `Your payment for ${serviceName} has been confirmed. Your session slot is now reserved.`,
            "payment",
            payment.reservation.id
          );
        } else if (
          reservationStatus === "EXPIRED" ||
          reservationStatus === "CANCELLED"
        ) {
          await notificationService.sendReservationNotification(
            payment.reservation.customer.id,
            "Reservation Cancelled",
            `Your reservation for ${serviceName} has been cancelled due to payment issue.`,
            "payment",
            payment.reservation.id
          );
        }
      } else {
        console.warn(
          `[TRIPAY CALLBACK] Customer data missing, notification not sent for payment ${reference}`
        );
      }
    }

    console.log("[TRIPAY CALLBACK] Successfully processed:", {
      reference,
      status,
      paymentStatus,
      reservationStatus,
      sessionBooked: shouldBookSession,
      sessionFreed: shouldFreeSession,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "Callback processed successfully",
      data: {
        reference,
        status: paymentStatus,
        reservationStatus,
        processed: true,
      },
    });
  } catch (error) {
    console.error("[PAYMENT CALLBACK ERROR]:", error);
    console.error("[PAYMENT CALLBACK ERROR] Stack:", error.stack);

    if (process.env.NODE_ENV === "production") {
      console.error("[CRITICAL] Payment callback failed:", {
        reference: req.body?.reference,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to process payment callback",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// PERBAIKAN: Tambahkan fungsi helper untuk mendapatkan payment dengan semua relasi
export const findPaymentByTransactionIdWithFullData = async (transactionId) => {
  try {
    const payment = await prisma.payment.findUnique({
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
            session: {
              select: {
                id: true,
                date: true,
                startTime: true,
                endTime: true,
                isBooked: true,
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
          merchantFee: payment.merchantFee || null, // BARU: Merchant fee
          qrCode: payment.tripayResponse?.qr_string || null, // BARU: QR code
          instructions: payment.tripayInstructions || {}, // BARU: Payment instructions
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
      notes: [
        `Manual booking`,
        parentNames ? `Parent: ${parentNames}` : null,
        customerAddress ? `Address: ${customerAddress}` : null,
        customerInstagram ? `Instagram: ${customerInstagram}` : null,
        notes || null,
      ]
        .filter(Boolean)
        .join("\n"),
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

    // SEND NOTIFICATIONS - non-blocking
    try {
      // Send notification to staff about new manual booking
      const sessionDateTime = new Date(
        result.reservation.session.timeSlot.operatingSchedule.date
      );

      await notificationService.sendNotificationToStaff(
        session.staffId,
        "New Manual Booking",
        `A new manual booking has been created for ${
          service.name
        } on ${formatDate(sessionDateTime)}. Status: ${
          result.reservation.status
        }`,
        "reservation",
        result.reservation.id
      );

      console.log("[MANUAL RESERVATION] Staff notification sent");
    } catch (notificationError) {
      console.warn(
        "[MANUAL RESERVATION] Failed to send notification:",
        notificationError.message
      );
      // Don't fail the request for notification errors
    }

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

      // Notify owner about new payment proof
      await notificationService.sendNotificationToOwner(
        "Updated Payment Proof",
        `A new payment proof has been uploaded for reservation #${reservation.id}`,
        "payment",
        reservation.id
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

      // Notify owner about new payment proof
      await notificationService.sendNotificationToOwner(
        "New Payment Proof",
        `A payment proof has been uploaded for reservation #${reservation.id}`,
        "payment",
        reservation.id
      );

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

    // Send notification to customer
    if (isVerified) {
      await notificationService.sendReservationNotification(
        payment.reservation.customerId,
        "Payment Verified",
        "Your payment has been verified and your reservation is now confirmed.",
        "payment",
        payment.reservationId
      );
    } else {
      await notificationService.sendReservationNotification(
        payment.reservation.customerId,
        "Payment Rejected",
        "Your payment has been rejected. Please contact us for more information.",
        "payment",
        payment.reservationId
      );
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
