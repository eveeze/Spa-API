// src/config/paymentExpiryJob.js
import {
  getExpiredPendingPayments,
  updatePayment,
  updateReservationStatus,
} from "../repository/reservationRepository.js";
import { updateSessionBookingStatus } from "../repository/sessionRepository.js";
import * as notificationService from "../services/notificationService.js";
import prisma from "./db.js";

/**
 * Memproses semua pembayaran yang statusnya PENDING dan sudah melewati tanggal kedaluwarsa.
 * Fungsi ini akan dipanggil oleh endpoint API.
 */
export const processExpiredPayments = async () => {
  try {
    console.log(
      `[CRON_RUNNER] Starting expired payment check at ${new Date().toISOString()}`
    );

    const expiredPayments = await getExpiredPendingPayments(true);

    if (expiredPayments.length === 0) {
      const message = "No expired payments found.";
      console.log(`[CRON_RUNNER] ${message}`);
      return { success: true, message };
    }

    console.log(
      `[CRON_RUNNER] Found ${expiredPayments.length} expired payments to process.`
    );

    let processedCount = 0;
    let errorCount = 0;

    for (const payment of expiredPayments) {
      try {
        if (payment.paymentStatus !== "PENDING") {
          console.log(
            `[CRON_RUNNER] Skipping payment ${payment.id} - status is already '${payment.paymentStatus}'.`
          );
          continue;
        }

        // --- Lakukan semua operasi database dalam satu transaksi ---
        await prisma.$transaction(async (tx) => {
          // 1. Update status pembayaran menjadi EXPIRED
          await tx.payment.update({
            where: { id: payment.id },
            data: { paymentStatus: "EXPIRED" },
          });

          // 2. Update status reservasi menjadi EXPIRED
          await tx.reservation.update({
            where: { id: payment.reservationId },
            data: { status: "EXPIRED" },
          });

          // 3. Bebaskan sesi agar bisa dipesan orang lain
          if (payment.reservation?.sessionId) {
            await tx.session.update({
              where: { id: payment.reservation.sessionId },
              data: { isBooked: false },
            });
          }
        });

        console.log(
          `[CRON_RUNNER] Session ${payment.reservation.sessionId} has been freed.`
        );

        // --- Kirim Notifikasi (setelah transaksi berhasil) ---
        if (payment.reservation?.customer) {
          await notificationService.createNotificationForCustomer(
            {
              recipientId: payment.reservation.customer.id,
              title: "Reservasi Dibatalkan",
              message: `Waktu pembayaran untuk layanan ${
                payment.reservation.service?.name || "Anda"
              } telah habis.`,
              type: "RESERVATION_CANCELLED_AUTO",
              referenceId: payment.reservationId,
            },
            {
              emailOptions: {
                templateName: "reservationCancelled",
                templateData: {
                  customerName: payment.reservation.customer.name,
                  serviceName:
                    payment.reservation.service?.name || "layanan Anda",
                  reservationId: payment.reservationId
                    .substring(0, 8)
                    .toUpperCase(),
                  reason:
                    "Waktu pembayaran telah melewati batas yang ditentukan.",
                },
              },
            }
          );
        }

        processedCount++;
        console.log(
          `[CRON_RUNNER] Successfully processed expired payment ${payment.id} for reservation ${payment.reservationId}.`
        );
      } catch (error) {
        errorCount++;
        console.error(
          `[CRON_RUNNER_ERROR] Failed to process expired payment ${payment.id}:`,
          error
        );
      }
    }

    const message = `Completed check. Processed: ${processedCount}, Errors: ${errorCount}.`;
    console.log(`[CRON_RUNNER] ${message}`);
    return { success: true, message };
  } catch (error) {
    console.error(
      "[CRON_RUNNER_FATAL] The entire expired payments job failed:",
      error
    );
    throw new Error(`The entire expired payments job failed: ${error.message}`);
  }
};
