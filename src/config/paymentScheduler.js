// src/config/paymentScheduler.js
import {
  getPaymentById,
  getPendingPaymentsForScheduler,
} from "../repository/reservationRepository.js";
import * as notificationService from "../services/notificationService.js";
import prisma from "./db.js";

class PaymentExpiryScheduler {
  constructor() {
    this.timers = new Map(); // Menyimpan referensi ke setiap timer
    this.isCleanupJobRunning = false;
  }

  /**
   * Menjadwalkan satu tugas kedaluwarsa untuk sebuah pembayaran.
   * @param {string} paymentId - ID pembayaran.
   * @param {Date} expiryDate - Waktu kedaluwarsa.
   */
  schedulePaymentExpiry(paymentId, expiryDate) {
    try {
      const now = new Date();
      const delay = new Date(expiryDate).getTime() - now.getTime();

      if (delay <= 0) {
        // Jika sudah kedaluwarsa, proses langsung
        this.processExpiredPayment(paymentId);
        return;
      }

      // Batalkan timer lama jika ada untuk paymentId yang sama
      this.cancelPaymentExpiry(paymentId);

      const timer = setTimeout(() => {
        this.processExpiredPayment(paymentId);
      }, delay);

      this.timers.set(paymentId, timer);
      console.log(
        `[SCHEDULER] Payment ${paymentId} scheduled to expire at ${new Date(
          expiryDate
        ).toISOString()}`
      );
    } catch (error) {
      console.error(
        `[SCHEDULER ERROR] Failed to schedule expiry for payment ${paymentId}:`,
        error
      );
    }
  }

  /**
   * Membatalkan timer kedaluwarsa (misalnya, jika pembayaran berhasil).
   * @param {string} paymentId - ID pembayaran.
   */
  cancelPaymentExpiry(paymentId) {
    const timer = this.timers.get(paymentId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(paymentId);
      console.log(`[SCHEDULER] Cancelled expiry for payment ${paymentId}`);
    }
  }

  /**
   * Logika inti untuk memproses pembayaran yang kedaluwarsa.
   * @param {string} paymentId - ID pembayaran yang akan diproses.
   */
  async processExpiredPayment(paymentId) {
    console.log(`[SCHEDULER] Processing expired payment ${paymentId}`);
    this.timers.delete(paymentId); // Hapus dari map setelah diproses

    try {
      const payment = await getPaymentById(paymentId);
      if (!payment || payment.paymentStatus !== "PENDING") {
        console.log(
          `[SCHEDULER] Skipping payment ${paymentId}. Not found or already processed.`
        );
        return;
      }

      // Gunakan transaksi untuk memastikan semua update berhasil atau tidak sama sekali
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
        `[SCHEDULER] Session ${payment.reservation.sessionId} has been freed.`
      );

      // Kirim notifikasi setelah transaksi berhasil
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
      console.log(
        `[SCHEDULER] Successfully expired reservation ${payment.reservationId}.`
      );
    } catch (error) {
      console.error(
        `[SCHEDULER ERROR] Failed to process payment ${paymentId}:`,
        error
      );
    }
  }

  /**
   * Saat server startup, muat semua pembayaran PENDING yang belum kedaluwarsa
   * dan jadwalkan ulang timernya.
   */
  async initializePendingPayments() {
    try {
      console.log("[SCHEDULER] Initializing existing pending payments...");
      const pendingPayments = await getPendingPaymentsForScheduler();
      for (const payment of pendingPayments) {
        this.schedulePaymentExpiry(payment.id, payment.expiryDate);
      }
      console.log(
        `[SCHEDULER] Initialized ${pendingPayments.length} pending payments.`
      );
    } catch (error) {
      console.error(
        "[SCHEDULER ERROR] Failed to initialize pending payments:",
        error
      );
    }
  }

  /**
   * Menjalankan tugas pembersihan periodik (bukan cron) untuk memastikan
   * map timers tidak membengkak jika ada error.
   */
  startCleanupJob() {
    if (this.isCleanupJobRunning) return;
    this.isCleanupJobRunning = true;
    setInterval(() => {
      console.log(`[SCHEDULER STATUS] Active timers: ${this.timers.size}`);
    }, 6 * 60 * 60 * 1000); // Setiap 6 jam
    console.log("[SCHEDULER] Periodic cleanup job started.");
  }

  /**
   * Mengosongkan semua timer saat server dimatikan.
   */
  clearAllTimers() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    console.log("[SCHEDULER] All timers cleared for shutdown.");
  }

  getStats() {
    return {
      activeTimers: this.timers.size,
    };
  }
}

const paymentScheduler = new PaymentExpiryScheduler();
export default paymentScheduler;
