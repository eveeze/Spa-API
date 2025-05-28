// src/config/paymentScheduler.js
import {
  getPaymentById,
  updatePayment,
  updateReservationStatus,
} from "../repository/reservationRepository.js";
import * as notificationService from "../services/notificationService.js";

class PaymentExpiryScheduler {
  constructor() {
    this.timers = new Map(); // Store individual timers
    this.isRunning = false;
  }

  // Schedule expiry untuk payment tertentu
  schedulePaymentExpiry(paymentId, expiryDate) {
    try {
      const now = new Date();
      const expiryTime = new Date(expiryDate);
      const delay = expiryTime.getTime() - now.getTime();

      // Jika sudah expired, process langsung
      if (delay <= 0) {
        this.processExpiredPayment(paymentId);
        return;
      }

      // Cancel existing timer jika ada
      this.cancelPaymentExpiry(paymentId);

      // Set timeout untuk auto-expire
      const timer = setTimeout(async () => {
        await this.processExpiredPayment(paymentId);
        this.timers.delete(paymentId);
      }, delay);

      // Store timer reference
      this.timers.set(paymentId, timer);

      console.log(
        `[SCHEDULER] Payment ${paymentId} scheduled to expire at ${expiryTime.toISOString()} (in ${Math.round(
          delay / 1000
        )} seconds)`
      );
    } catch (error) {
      console.error(
        `[SCHEDULER ERROR] Failed to schedule payment ${paymentId}:`,
        error
      );
    }
  }

  // Cancel scheduled expiry (jika payment berhasil)
  cancelPaymentExpiry(paymentId) {
    try {
      const timer = this.timers.get(paymentId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(paymentId);
        console.log(`[SCHEDULER] Cancelled expiry for payment ${paymentId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(
        `[SCHEDULER ERROR] Failed to cancel payment ${paymentId}:`,
        error
      );
      return false;
    }
  }

  // Process expired payment
  async processExpiredPayment(paymentId) {
    try {
      console.log(`[SCHEDULER] Processing expired payment ${paymentId}`);

      const payment = await getPaymentById(paymentId);
      if (!payment) {
        console.log(`[SCHEDULER] Payment ${paymentId} not found`);
        return;
      }

      if (payment.paymentStatus !== "PENDING") {
        console.log(
          `[SCHEDULER] Payment ${paymentId} already processed (status: ${payment.paymentStatus})`
        );
        return;
      }

      // Update payment status ke EXPIRED
      await updatePayment(paymentId, {
        paymentStatus: "EXPIRED",
        updatedAt: new Date(),
      });

      // Update reservation status ke EXPIRED
      await updateReservationStatus(payment.reservationId, "EXPIRED");

      // Send notification
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

      console.log(
        `[SCHEDULER] Successfully expired payment ${paymentId} and reservation ${payment.reservationId}`
      );
    } catch (error) {
      console.error(
        `[SCHEDULER ERROR] Failed to expire payment ${paymentId}:`,
        error
      );
    }
  }

  // Initialize existing pending payments pada startup
  async initializePendingPayments() {
    try {
      console.log("[SCHEDULER] Initializing existing pending payments...");

      // Import di sini untuk avoid circular dependency
      const { getExpiredPendingPayments } = await import(
        "../repository/reservationRepository.js"
      );

      // Get all payments yang masih PENDING tapi belum expired
      const pendingPayments = await getExpiredPendingPayments(false); // false = get pending, not expired

      for (const payment of pendingPayments) {
        if (payment.expiryDate) {
          this.schedulePaymentExpiry(payment.id, payment.expiryDate);
        }
      }

      console.log(
        `[SCHEDULER] Initialized ${pendingPayments.length} pending payments`
      );
    } catch (error) {
      console.error(
        "[SCHEDULER ERROR] Failed to initialize pending payments:",
        error
      );
    }
  }

  // Start cleanup job untuk clean up expired timers
  startCleanupJob() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Cleanup setiap 2 jam
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      // Simple cleanup - remove timers yang sudah tidak ada reference
      for (const [paymentId, timer] of this.timers.entries()) {
        // Check if timer masih valid
        if (timer._destroyed === true) {
          this.timers.delete(paymentId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[SCHEDULER CLEANUP] Cleaned ${cleaned} expired timers`);
      }

      console.log(`[SCHEDULER STATUS] Active timers: ${this.timers.size}`);
    }, 2 * 60 * 60 * 1000); // 2 hours

    console.log("[SCHEDULER] Cleanup job started");
  }

  // Get scheduler stats
  getStats() {
    return {
      activeTimers: this.timers.size,
      isRunning: this.isRunning,
      timerIds: Array.from(this.timers.keys()),
    };
  }

  // Manual cleanup method
  clearAllTimers() {
    for (const [paymentId, timer] of this.timers.entries()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    console.log("[SCHEDULER] All timers cleared");
  }
}

const paymentScheduler = new PaymentExpiryScheduler();
export default paymentScheduler;
