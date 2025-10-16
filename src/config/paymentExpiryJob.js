// src/jobs/paymentExpiryJob.js
import cron from "node-cron";
import {
  getExpiredPendingPayments,
  updatePayment,
  updateReservationStatus,
} from "../repository/reservationRepository.js";
import { updateSessionBookingStatus } from "../repository/sessionRepository.js";
import * as notificationService from "../services/notificationService.js";

/**
 * Processes payments that have passed their expiry date.
 */
const processExpiredPayments = async () => {
  try {
    console.log(
      `[CRON JOB] Starting expired payment check at ${new Date().toISOString()}`
    );

    const expiredPayments = await getExpiredPendingPayments(true);

    if (expiredPayments.length === 0) {
      console.log("[CRON JOB] No expired payments found.");
      return;
    }

    console.log(
      `[CRON JOB] Found ${expiredPayments.length} expired payments to process.`
    );

    let processedCount = 0;
    let errorCount = 0;

    for (const payment of expiredPayments) {
      try {
        if (payment.paymentStatus !== "PENDING") {
          console.log(
            `[CRON JOB] Skipping payment ${payment.id} - status is already '${payment.paymentStatus}'.`
          );
          continue;
        }

        // --- DATABASE OPERATIONS ---
        await updatePayment(payment.id, {
          paymentStatus: "EXPIRED",
        });
        await updateReservationStatus(payment.reservationId, "EXPIRED");
        if (payment.reservation?.sessionId) {
          await updateSessionBookingStatus(
            payment.reservation.sessionId,
            false
          );
          console.log(
            `[CRON JOB] Session ${payment.reservation.sessionId} has been freed.`
          );
        }

        // --- NOTIFICATION LOGIC (NOW SENDS EMAIL) ---
        if (payment.reservation?.customer) {
          await notificationService.createNotificationForCustomer(
            {
              recipientId: payment.reservation.customer.id,
              title: "Reservasi Dibatalkan", // This will be the email subject
              message: `Reservasi Anda untuk layanan ${
                payment.reservation.service?.name || "Anda"
              } telah dibatalkan karena waktu pembayaran telah habis.`,
              type: "RESERVATION_CANCELLED_AUTO",
              referenceId: payment.reservationId,
            },
            {
              // We are no longer sending a push notification
              // Instead, we provide email options
              emailOptions: {
                templateName: "reservationCancelled", // The new HTML template file
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
          `[CRON JOB] Successfully processed expired payment ${payment.id} for reservation ${payment.reservationId}.`
        );
      } catch (error) {
        errorCount++;
        console.error(
          `[CRON JOB ERROR] Failed to process expired payment ${payment.id}:`,
          error
        );
      }
    }

    console.log(
      `[CRON JOB] Completed check. Processed: ${processedCount}, Errors: ${errorCount}.`
    );
  } catch (error) {
    console.error(
      "[CRON JOB FATAL ERROR] The entire expired payments job failed:",
      error
    );
  }
};

/**
 * Initializes and starts the cron job for handling expired payments.
 */
const startPaymentExpiryJob = () => {
  console.log("[CRON] Initializing payment expiry job...");
  cron.schedule("*/15 * * * *", processExpiredPayments, {
    scheduled: true,
    timezone: process.env.TIMEZONE || "Asia/Jakarta",
    name: "payment-expiry-job",
  });
  console.log("[CRON] Payment expiry job scheduled to run every 15 minutes.");
};

/**
 * A function to manually trigger the payment expiry check, useful for testing.
 */
const runPaymentExpiryNow = async () => {
  console.log("[MANUAL RUN] Triggering payment expiry check manually...");
  await processExpiredPayments();
  console.log("[MANUAL RUN] Manual check completed.");
};

export { startPaymentExpiryJob, runPaymentExpiryNow };
