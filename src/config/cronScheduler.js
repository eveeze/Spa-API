// src/config/cronScheduler.js
import cron from "node-cron";
import axios from "axios";
import dotenv from "dotenv";
import crypto from "node:crypto"; // <-- TAMBAHKAN BARIS INI

dotenv.config();

/**
 * Initialize cron jobs
 * @param {String} apiBaseUrl - The base URL of the API
 */
export const initCronJobs = (apiBaseUrl) => {
  // Schedule to run every Sunday at midnight (0 0 * * 0)
  cron.schedule("0 0 * * 0", async () => {
    console.log(
      "[CRON] Running scheduled generation at",
      new Date().toISOString()
    );

    try {
      const secret = process.env.SCHEDULER_SECRET || "default-secret";
      const response = await axios.get(
        `${apiBaseUrl}/api/scheduler/cron?secret=${secret}`
      );

      console.log("[CRON] Scheduled generation result:", response.data);
    } catch (error) {
      console.error("[CRON] Scheduled generation failed:", error.message);
    }
  });

  console.log("[CRON] Schedule generation job initialized");
};
cron.schedule(
  "0 9 * * *",
  async () => {
    console.log(
      "[CRON_REMINDER] Running H-1 reservation reminder job at",
      new Date().toISOString()
    );

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfTomorrow = new Date(tomorrow.setHours(0, 0, 0, 0));
    const endOfTomorrow = new Date(tomorrow.setHours(23, 59, 59, 999));

    try {
      const upcomingReservations = await prisma.reservation.findMany({
        where: {
          status: "CONFIRMED",
          session: {
            timeSlot: {
              startTime: {
                gte: startOfTomorrow,
                lte: endOfTomorrow,
              },
            },
          },
        },
        include: {
          customer: {
            select: { id: true, oneSignalPlayerId: true },
          },
          service: {
            select: { name: true },
          },
          session: {
            include: {
              timeSlot: true,
            },
          },
        },
      });

      console.log(
        `[CRON_REMINDER] Found ${upcomingReservations.length} reservations for tomorrow.`
      );

      for (const reservation of upcomingReservations) {
        const time = new Date(
          reservation.session.timeSlot.startTime
        ).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

        await notificationService.sendPushNotificationToCustomer(
          reservation.customer.id,
          "Pengingat Jadwal Spa Besok",
          `Jangan lupa, jadwal spa Anda untuk layanan ${reservation.service.name} adalah besok pukul ${time}.`,
          { reservationId: reservation.id }
        );
      }
    } catch (error) {
      console.error("[CRON_REMINDER_ERROR] Failed to send reminders:", error);
    }
  },
  {
    scheduled: true,
    timezone: "Asia/Jakarta", // Penting untuk zona waktu
  }
);

console.log("[CRON] H-1 Reservation reminder job initialized.");

/**
 * Run the schedule generation manually
 * @returns {Promise} The result of the schedule generation
 */
export const runManualGeneration = async () => {
  try {
    const secret = process.env.SCHEDULER_SECRET || "default-secret";
    const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:5000";

    const response = await axios.get(
      `${apiBaseUrl}/api/scheduler/cron?secret=${secret}`
    );
    return response.data;
  } catch (error) {
    console.error("[MANUAL CRON] Generation failed:", error.message);
    throw error;
  }
};
