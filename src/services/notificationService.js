// src/services/notificationService.js
import prisma from "../config/db.js";

/**
 * Send notification to a customer
 * @param {String} customerId - ID of the customer
 * @param {String} title - Notification title
 * @param {String} message - Notification message
 * @param {String} type - Notification type (reservation, payment, etc.)
 * @param {String} referenceId - Reference ID (e.g., reservationId)
 */
export const sendReservationNotification = async (
  customerId,
  title,
  message,
  type,
  referenceId,
) => {
  try {
    await prisma.notification.create({
      data: {
        recipientType: "customer",
        recipientId: customerId,
        title,
        message,
        type,
        referenceId,
        isRead: false,
      },
    });
  } catch (error) {
    console.error("[NOTIFICATION SERVICE ERROR]:", error);
    // Don't throw the error to prevent breaking the main flow
  }
};

/**
 * Send notification to all owners
 * @param {String} title - Notification title
 * @param {String} message - Notification message
 * @param {String} type - Notification type (reservation, payment, etc.)
 * @param {String} referenceId - Reference ID (e.g., reservationId)
 */
export const sendNotificationToOwner = async (
  title,
  message,
  type,
  referenceId,
) => {
  try {
    // Get all owners
    const owners = await prisma.owner.findMany({
      select: {
        id: true,
      },
    });

    // Create a notification for each owner
    const notifications = owners.map((owner) => ({
      recipientType: "owner",
      recipientId: owner.id,
      title,
      message,
      type,
      referenceId,
      isRead: false,
    }));

    // Create all notifications in a single transaction
    await prisma.notification.createMany({
      data: notifications,
    });
  } catch (error) {
    console.error("[NOTIFICATION SERVICE ERROR]:", error);
    // Don't throw the error to prevent breaking the main flow
  }
};

/**
 * Get notifications for a recipient
 * @param {String} recipientType - Type of recipient (customer, owner)
 * @param {String} recipientId - ID of the recipient
 * @param {Boolean} unreadOnly - Whether to get only unread notifications
 * @param {Number} page - Page number
 * @param {Number} limit - Items per page
 */
export const getNotifications = async (
  recipientType,
  recipientId,
  unreadOnly = false,
  page = 1,
  limit = 10,
) => {
  try {
    const skip = (page - 1) * limit;

    // Build query conditions
    const where = {
      recipientType,
      recipientId,
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    // Get total count
    const total = await prisma.notification.count({ where });

    // Get notifications
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    return {
      data: notifications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error("[GET NOTIFICATIONS ERROR]:", error);
    throw error;
  }
};

/**
 * Mark notification as read
 * @param {String} notificationId - ID of the notification
 * @param {String} recipientType - Type of recipient (customer, owner)
 * @param {String} recipientId - ID of the recipient
 */
export const markNotificationAsRead = async (
  notificationId,
  recipientType,
  recipientId,
) => {
  try {
    // Verify the notification belongs to the recipient
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientType,
        recipientId,
      },
    });

    if (!notification) {
      throw new Error(
        "Notification not found or does not belong to the recipient",
      );
    }

    // Update notification
    return await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  } catch (error) {
    console.error("[MARK NOTIFICATION AS READ ERROR]:", error);
    throw error;
  }
};

/**
 * Mark all notifications as read
 * @param {String} recipientType - Type of recipient (customer, owner)
 * @param {String} recipientId - ID of the recipient
 */
export const markAllNotificationsAsRead = async (
  recipientType,
  recipientId,
) => {
  try {
    // Update all unread notifications for the recipient
    return await prisma.notification.updateMany({
      where: {
        recipientType,
        recipientId,
        isRead: false,
      },
      data: { isRead: true },
    });
  } catch (error) {
    console.error("[MARK ALL NOTIFICATIONS AS READ ERROR]:", error);
    throw error;
  }
};
