// src/config/cronScheduler.js
import prisma from "../config/db.js";
import * as notificationService from "../services/notificationService.js";

/**
 * Menjalankan tugas pengiriman pengingat reservasi H-1.
 * Fungsi ini akan dipanggil oleh endpoint API.
 */
export const runH1Reminder = async () => {
  console.log(
    "[CRON_RUNNER] Running H-1 reservation reminder job at",
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
      `[CRON_RUNNER] Found ${upcomingReservations.length} reservations for tomorrow.`
    );

    let successCount = 0;
    for (const reservation of upcomingReservations) {
      const time = new Date(
        reservation.session.timeSlot.startTime
      ).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      });

      // Menggunakan service notifikasi yang sudah ada
      await notificationService.createNotificationForCustomer(
        {
          recipientId: reservation.customer.id,
          title: "Pengingat Jadwal Spa Besok",
          message: `Jangan lupa, jadwal spa Anda untuk layanan ${reservation.service.name} adalah besok pukul ${time}.`,
          type: "RESERVATION_REMINDER",
          referenceId: reservation.id,
        },
        { sendPush: true }
      );
      successCount++;
    }

    return {
      success: true,
      message: `Successfully sent ${successCount} of ${upcomingReservations.length} reminders.`,
    };
  } catch (error) {
    console.error("[CRON_RUNNER_ERROR] Failed to send reminders:", error);
    throw new Error(`Failed to send reminders: ${error.message}`);
  }
};
