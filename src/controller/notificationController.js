import prisma from "../config/db.js";

export const getNotifications = async (req, res) => {
  const userId = req.customer?.id || req.owner?.id;
  const userType = req.customer ? "customer" : "owner";

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: Please log in." });
  }

  try {
    const notifications = await prisma.notification.findMany({
      where: {
        recipientId: userId,
        recipientType: userType,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error("[GET_NOTIFICATIONS_ERROR]", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch notifications." });
  }
};
