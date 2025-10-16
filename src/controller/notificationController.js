// src/controller/notificationController.js

import prisma from "../config/db.js";

/**
 * Mengambil notifikasi untuk pengguna dengan pagination.
 * Menerima query params: ?page=1&pageSize=20
 */
export const getNotifications = async (req, res) => {
  const userId = req.customer?.id || req.owner?.id;
  const userType = req.customer ? "customer" : "owner";

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: Please log in." });
  }

  // Ambil query params untuk pagination, dengan nilai default
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const skip = (page - 1) * pageSize;

  try {
    // Jalankan dua query secara bersamaan untuk efisiensi
    const [notifications, totalNotifications] = await prisma.$transaction([
      prisma.notification.findMany({
        where: {
          recipientId: userId,
          recipientType: userType,
        },
        orderBy: { createdAt: "desc" },
        skip: skip,
        take: pageSize,
      }),
      prisma.notification.count({
        where: {
          recipientId: userId,
          recipientType: userType,
        },
      }),
    ]);

    // Kirim respons dengan data dan metadata pagination
    res.status(200).json({
      success: true,
      data: notifications,
      meta: {
        total: totalNotifications,
        page: page,
        pageSize: pageSize,
        totalPages: Math.ceil(totalNotifications / pageSize),
      },
    });
  } catch (error) {
    console.error("[GET_NOTIFICATIONS_ERROR]", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch notifications." });
  }
};

/**
 * Menandai satu notifikasi sebagai sudah dibaca.
 */
export const markAsRead = async (req, res) => {
  const { notificationId } = req.params;
  const userId = req.customer?.id || req.owner?.id;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientId: userId, // Pastikan notifikasi ini milik user yang login
      },
    });

    if (!notification) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Notification not found or you don't have permission.",
        });
    }

    // Jika sudah dibaca, tidak perlu update lagi
    if (notification.isRead) {
      return res.status(200).json({ success: true, data: notification });
    }

    const updatedNotification = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    res.status(200).json({ success: true, data: updatedNotification });
  } catch (error) {
    console.error("[MARK_AS_READ_ERROR]", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update notification." });
  }
};

/**
 * [BARU] Menandai semua notifikasi pengguna sebagai sudah dibaca.
 */
export const markAllAsRead = async (req, res) => {
  const userId = req.customer?.id || req.owner?.id;
  const userType = req.customer ? "customer" : "owner";

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    // Update semua notifikasi yang belum dibaca milik pengguna
    const result = await prisma.notification.updateMany({
      where: {
        recipientId: userId,
        recipientType: userType,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
      data: {
        count: result.count, // Jumlah notifikasi yang berhasil di-update
      },
    });
  } catch (error) {
    console.error("[MARK_ALL_AS_READ_ERROR]", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update notifications." });
  }
};
