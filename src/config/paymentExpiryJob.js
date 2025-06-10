// src/jobs/paymentExpiryJob.js
import cron from "node-cron";
import {
  getExpiredPendingPayments,
  updatePayment,
  updateReservationStatus,
} from "../repository/reservationRepository.js";
import * as notificationService from "../services/notificationService.js";
import crypto from "node:crypto"; // <-- TAMBAHKAN BARIS INI

// Function untuk process expired payments
const processExpiredPayments = async () => {
  try {
    console.log(
      `[CRON JOB] Starting expired payment check at ${new Date().toISOString()}`
    );

    // Get all pending payments yang sudah expired
    const expiredPayments = await getExpiredPendingPayments(true); // true = get expired only

    if (expiredPayments.length === 0) {
      console.log("[CRON JOB] No expired payments found");
      return;
    }

    console.log(`[CRON JOB] Found ${expiredPayments.length} expired payments`);

    let processedCount = 0;
    let errorCount = 0;

    for (const payment of expiredPayments) {
      try {
        // Double check - pastikan payment masih PENDING
        if (payment.paymentStatus !== "PENDING") {
          console.log(
            `[CRON JOB] Skipping payment ${payment.id} - status already ${payment.paymentStatus}`
          );
          continue;
        }

        // Update payment status ke EXPIRED
        await updatePayment(payment.id, {
          paymentStatus: "EXPIRED",
          updatedAt: new Date(),
        });

        // Update reservation status ke EXPIRED
        await updateReservationStatus(payment.reservationId, "EXPIRED");

        // Send notification ke customer
        if (payment.reservation && payment.reservation.customer) {
          await notificationService.sendReservationNotification(
            payment.reservation.customer.id,
            "Payment Expired",
            `Your payment for ${
              payment.reservation.service?.name || "service"
            } has expired. Please make a new reservation if you still want to book this service.`,
            "payment",
            payment.reservationId
          );
        }

        processedCount++;
        console.log(
          `[CRON JOB] Successfully expired payment ${payment.id} and reservation ${payment.reservationId}`
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
      `[CRON JOB] Completed expired payment check. Processed: ${processedCount}, Errors: ${errorCount}`
    );
  } catch (error) {
    console.error(
      "[CRON JOB ERROR] Failed to process expired payments:",
      error
    );
  }
};

// Backup function untuk manual cleanup
const forceExpireOldPayments = async () => {
  try {
    console.log("[FORCE EXPIRE] Starting force expire old payments...");

    // Get payments yang expired lebih dari 1 jam tapi masih PENDING
    const oldExpiredPayments = await getExpiredPendingPayments(true, 1); // 1 hour grace period

    for (const payment of oldExpiredPayments) {
      await processexpiredPayments([payment]);
    }

    console.log(
      `[FORCE EXPIRE] Processed ${oldExpiredPayments.length} old payments`
    );
  } catch (error) {
    console.error("[FORCE EXPIRE ERROR]:", error);
  }
};

// Schedule cron job - jalan setiap 15 menit untuk lebih responsive
const startPaymentExpiryJob = () => {
  console.log("[CRON JOB] Payment expiry job scheduled");

  // Jalan setiap 15 menit
  cron.schedule("*/15 * * * *", processExpiredPayments, {
    scheduled: true,
    timezone: process.env.TIMEZONE || "Asia/Jakarta",
    name: "payment-expiry-job",
  });

  // Backup job - jalan setiap 2 jam untuk cleanup payments yang terlewat
  cron.schedule("0 */2 * * *", forceExpireOldPayments, {
    scheduled: true,
    timezone: process.env.TIMEZONE || "Asia/Jakarta",
    name: "force-expire-old-payments",
  });

  console.log("[CRON JOB] Payment expiry jobs scheduled:");
  console.log("  - Main job: every 15 minutes");
  console.log("  - Backup job: every 2 hours");
};

// Function untuk manual run (untuk testing)
const runPaymentExpiryNow = async () => {
  console.log("[MANUAL RUN] Running payment expiry check manually...");
  await processExpiredPayments();
};

export { startPaymentExpiryJob, processExpiredPayments, runPaymentExpiryNow };
