import prisma from "../config/db.js";
import oneSignalClient from "../config/oneSignalClient.js";
import { sendEmailWithTemplate } from "../utils/email.js";
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
  // UBAH: Opsi email sekarang lebih terstruktur
  options = { sendPush: false, emailOptions: null }
) => {
  const {
    sendPush = false,
    // UBAH: Ambil emailOptions dari parameter
    emailOptions = null,
  } = options;
  const { recipientId, title, message, type, referenceId } = notificationData;

  // 1. Simpan notifikasi ke database (tidak ada perubahan)
  try {
    await prisma.notification.create({
      data: {
        recipientId,
        recipientType: "customer",
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
  if (!sendPush && !emailOptions) return;

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
      message, // pushMessage bisa ditambahkan di sini jika perlu
      { referenceId }
    );
  }

  // UBAH: Logika pengiriman email menggunakan sistem template
  if (emailOptions && customer.email) {
    const { templateName, templateData } = emailOptions;
    if (templateName && templateData) {
      await sendEmailWithTemplate(
        customer.email,
        title, // Judul notifikasi menjadi subjek email
        templateName,
        templateData
      );
    } else {
      console.warn(
        "[EMAIL_SEND_WARN] emailOptions diberikan tapi tidak lengkap (membutuhkan templateName dan templateData)."
      );
    }
  }
};

/**
 * ==========================================================================================
 * FUNGSI (2): Membuat notifikasi untuk SEMUA owner dan mengirim Push Notification + EMAIL.
 * ==========================================================================================
 */
export const createNotificationForAllOwners = async (
  notificationData,
  options = {}
) => {
  const { sendPush = false, emailOptions = null } = options;
  const { title, message, type, referenceId, pushMessage } = notificationData;

  try {
    // 1. Ambil data owner (ID, OneSignal ID, Email, Nama)
    const owners = await prisma.owner.findMany({
      select: { id: true, oneSignalPlayerId: true, email: true, name: true },
    });

    if (owners.length === 0) {
      console.warn("[OWNER_NOTIFICATION] Tidak ada owner yang ditemukan.");
      return;
    }

    // 2. Simpan notifikasi ke database (untuk lonceng notifikasi di dashboard)
    const notificationsToCreate = owners.map((owner) => ({
      recipientId: owner.id,
      recipientType: "owner",
      title,
      message,
      type,
      referenceId,
    }));

    await prisma.notification.createMany({
      data: notificationsToCreate,
    });

    // 3. Kirim Push Notification (OneSignal)
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

    // 4. [LOGIKA BARU] Kirim Email ke Owner (Jika ada emailOptions)
    if (emailOptions) {
      const { templateName, templateData } = emailOptions;

      // Filter owner yang punya email valid
      const ownersWithEmail = owners.filter((o) => o.email);

      // Kirim email secara paralel
      await Promise.all(
        ownersWithEmail.map(async (owner) => {
          try {
            // Inject nama owner agar email lebih personal
            const finalData = { ...templateData, ownerName: owner.name };

            await sendEmailWithTemplate(
              owner.email,
              title,
              templateName,
              finalData
            );
          } catch (err) {
            console.error(
              `[EMAIL_FAIL] Gagal kirim ke owner ${owner.email}:`,
              err.message
            );
            // Kita catch error di sini agar 1 gagal tidak membatalkan yang lain
          }
        })
      );

      if (ownersWithEmail.length > 0) {
        console.log(
          `[OWNER_NOTIFICATION] Email instruksi dikirim ke ${ownersWithEmail.length} owner.`
        );
      }
    }
  } catch (error) {
    console.error(
      "[OWNER_NOTIFICATION_ERROR] Gagal membuat notifikasi:",
      error
    );
  }
};
