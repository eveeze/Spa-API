// src/services/notificationService.js
import prisma from "../config/db.js";
import oneSignalClient from "../config/oneSignalClient.js";
// PERBAIKAN: Impor dari file dan fungsi yang benar
import { sendEmail } from "../utils/email.js";

/**
 * Mengirim Push Notification menggunakan OneSignal.
 * (Fungsi ini tetap sama)
 */
const sendPushNotification = async (playerIds, title, message, data = {}) => {
  if (!playerIds || playerIds.length === 0) {
    console.warn("[PUSH_NOTIFICATION] No player IDs provided. Skipping.");
    return;
  }
  // ... (sisa kode sendPushNotification tidak berubah)
  const notification = {
    contents: {
      en: message,
    },
    headings: {
      en: title,
    },
    include_player_ids: playerIds.filter((id) => id),
    data: data,
  };

  try {
    const response = await oneSignalClient.createNotification(notification);
    console.log("[PUSH_NOTIFICATION] Sent successfully:", response.body.id);
  } catch (error) {
    console.error(
      "[PUSH_NOTIFICATION_ERROR] Failed to send:",
      error.response?.data || error.message
    );
  }
};

/**
 * Mengirim Push Notification ke semua owner yang terdaftar.
 * (Fungsi ini tetap sama)
 */
export const sendPushNotificationToOwner = async (
  title,
  message,
  data = {}
) => {
  try {
    const owners = await prisma.owner.findMany({
      where: { oneSignalPlayerId: { not: null } },
      select: { oneSignalPlayerId: true },
    });

    const ownerPlayerIds = owners.map((owner) => owner.oneSignalPlayerId);

    if (ownerPlayerIds.length > 0) {
      await sendPushNotification(ownerPlayerIds, title, message, data);
    } else {
      console.warn(
        "[OWNER_NOTIFICATION] No owners with OneSignal Player ID found."
      );
    }
  } catch (error) {
    console.error("[OWNER_NOTIFICATION_ERROR] Error fetching owners:", error);
  }
};

/**
 * Mengirim Push Notification ke customer spesifik.
 * (Fungsi ini tetap sama)
 */
export const sendPushNotificationToCustomer = async (
  customerId,
  title,
  message,
  data = {}
) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { oneSignalPlayerId: true },
    });

    if (customer && customer.oneSignalPlayerId) {
      await sendPushNotification(
        [customer.oneSignalPlayerId],
        title,
        message,
        data
      );
    } else {
      console.warn(
        `[CUSTOMER_NOTIFICATION] Customer ${customerId} has no OneSignal Player ID.`
      );
    }
  } catch (error) {
    console.error(
      `[CUSTOMER_NOTIFICATION_ERROR] Failed for customer ${customerId}:`,
      error
    );
  }
};

/**
 * PERBAIKAN: Mengirim Email Transaksional menggunakan fungsi dari email.js.
 * @param {string} to - Alamat email penerima.
 * @param {string} subject - Judul email.
 * @param {string} html - Konten email dalam format HTML.
 */
export const sendTransactionalEmail = async (to, subject, html) => {
  // Memanggil fungsi sendEmail yang sudah kita buat di utils/email.js
  await sendEmail(to, subject, html);
};
