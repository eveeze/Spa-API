import prisma from "../config/db.js";
import oneSignalClient from "../config/oneSignalClient.js";
import { sendEmail } from "../utils/email.js";

/**
 * [HELPER INTERNAL] Fungsi dasar untuk mengirim Push Notification ke OneSignal.
 * @private
 */
const _sendPushNotification = async (playerIds, title, message, data = {}) => {
  const validPlayerIds = playerIds.filter((id) => id);
  if (validPlayerIds.length === 0) {
    console.warn(
      "[PUSH_NOTIFICATION] Tidak ada Player ID valid. Pengiriman dilewati."
    );
    return;
  }
  const notification = {
    contents: { en: message },
    headings: { en: title },
    include_player_ids: validPlayerIds,
    data: data,
  };
  try {
    const response = await oneSignalClient.createNotification(notification);
    console.log(
      "[PUSH_NOTIFICATION] Berhasil dikirim ke OneSignal:",
      response.body.id
    );
  } catch (error) {
    console.error(
      "[PUSH_NOTIFICATION_ERROR] Gagal mengirim:",
      error.response?.data || error.message
    );
  }
};

/**
 * ==========================================================================================
 * FUNGSI (1): Membuat dan mengirim notifikasi untuk SATU CUSTOMER spesifik.
 * ==========================================================================================
 */
export const createNotificationForCustomer = async (
  notificationData,
  options = {}
) => {
  const {
    sendPush = false,
    shouldSendEmail = false,
    emailHtml = "",
    pushMessage = "",
  } = options;
  const { recipientId, title, message, type, referenceId } = notificationData;

  // 1. Simpan notifikasi ke database untuk customer ini.
  try {
    await prisma.notification.create({
      data: {
        recipientId,
        recipientType: "customer", // Hardcoded untuk customer
        title,
        message,
        type,
        referenceId,
      },
    });
    console.log(
      `[DB_NOTIFICATION] Notifikasi untuk customer #${recipientId} berhasil disimpan.`
    );
  } catch (dbError) {
    console.error(
      "[DB_NOTIFICATION_ERROR] Gagal menyimpan notifikasi:",
      dbError
    );
  }

  // 2. Kirim notifikasi real-time jika diminta.
  if (!sendPush && !shouldSendEmail) return;

  const customer = await prisma.customer.findUnique({
    where: { id: recipientId },
    select: { email: true, oneSignalPlayerId: true },
  });

  if (!customer) {
    console.warn(
      `[NOTIFICATION_SEND] Customer #${recipientId} tidak ditemukan.`
    );
    return;
  }

  if (sendPush && customer.oneSignalPlayerId) {
    await _sendPushNotification(
      [customer.oneSignalPlayerId],
      title,
      pushMessage || message,
      { referenceId }
    );
  }

  if (shouldSendEmail && customer.email) {
    await sendEmail(customer.email, title, emailHtml || message);
  }
};

/**
 * ==========================================================================================
 * FUNGSI (2): Membuat notifikasi untuk SEMUA owner dan mengirim satu push notification.
 * ==========================================================================================
 */
export const createNotificationForAllOwners = async (
  notificationData,
  options = {}
) => {
  const { sendPush = false } = options;
  const { title, message, type, referenceId, pushMessage } = notificationData;

  try {
    const owners = await prisma.owner.findMany({
      select: { id: true, oneSignalPlayerId: true },
    });

    if (owners.length === 0) {
      console.warn(
        "[OWNER_NOTIFICATION] Tidak ada owner yang ditemukan di database."
      );
      return;
    }

    // 1. Buat data notifikasi untuk setiap owner (untuk disimpan ke DB)
    const notificationsToCreate = owners.map((owner) => ({
      recipientId: owner.id, // ID owner spesifik
      recipientType: "owner",
      title,
      message,
      type,
      referenceId,
    }));

    // Simpan semua notifikasi ke database dalam satu perintah
    await prisma.notification.createMany({
      data: notificationsToCreate,
    });
    console.log(
      `[DB_NOTIFICATION] ${owners.length} notifikasi untuk owner berhasil disimpan.`
    );

    // 2. Kirim SATU push notification ke semua owner sekaligus (efisien)
    if (sendPush) {
      const ownerPlayerIds = owners
        .map((owner) => owner.oneSignalPlayerId)
        .filter((id) => id);
      if (ownerPlayerIds.length > 0) {
        await _sendPushNotification(
          ownerPlayerIds,
          title,
          pushMessage || message,
          { referenceId }
        );
      }
    }
  } catch (error) {
    console.error(
      "[OWNER_NOTIFICATION_ERROR] Gagal membuat notifikasi untuk owner:",
      error
    );
  }
};
