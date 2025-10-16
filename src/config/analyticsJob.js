import cron from "node-cron";
import prisma from "../config/db.js";

/**
 * Calculates and saves a summary of the previous day's business analytics.
 */
const calculateDailyAnalytics = async () => {
  try {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
    const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));

    const dateString = startOfYesterday.toISOString().split("T")[0];
    console.log(`[ANALYTICS JOB] Running for date: ${dateString}`);

    // 1. Get all relevant reservations from the previous day
    const reservationsYesterday = await prisma.reservation.findMany({
      where: {
        // We look at when the reservation was completed or cancelled, not created
        updatedAt: {
          gte: startOfYesterday,
          lte: endOfYesterday,
        },
      },
      include: {
        payment: true,
      },
    });

    // 2. Calculate basic metrics
    const completedReservations = reservationsYesterday.filter(
      (r) => r.status === "COMPLETED"
    );
    const totalBookings = reservationsYesterday.length; // All reservations updated yesterday
    const completedBookings = completedReservations.length;
    const cancelledBookings = reservationsYesterday.filter((r) =>
      ["CANCELLED", "EXPIRED"].includes(r.status)
    ).length;
    const totalRevenue = completedReservations.reduce(
      (sum, r) => sum + (r.payment?.amount || 0),
      0
    );

    // 3. Calculate most popular service & staff from completed reservations
    const serviceCounts = completedReservations.reduce((acc, r) => {
      acc[r.serviceId] = (acc[r.serviceId] || 0) + 1;
      return acc;
    }, {});

    const staffCounts = completedReservations.reduce((acc, r) => {
      acc[r.staffId] = (acc[r.staffId] || 0) + 1;
      return acc;
    }, {});

    const popularServiceId =
      Object.keys(serviceCounts).sort(
        (a, b) => serviceCounts[b] - serviceCounts[a]
      )[0] || null;
    const popularStaffId =
      Object.keys(staffCounts).sort(
        (a, b) => staffCounts[b] - staffCounts[a]
      )[0] || null;

    // 4. Save the results to the database using 'upsert'
    await prisma.analytics.upsert({
      where: { date: startOfYesterday },
      update: {
        totalRevenue,
        totalBookings,
        completedBookings,
        cancelledBookings,
        popularServiceId,
        popularStaffId,
      },
      create: {
        date: startOfYesterday,
        totalRevenue,
        totalBookings,
        completedBookings,
        cancelledBookings,
        popularServiceId,
        popularStaffId,
      },
    });

    console.log(
      `[ANALYTICS JOB] Successfully saved analytics for ${dateString}`
    );
  } catch (error) {
    console.error(
      "[ANALYTICS JOB ERROR] Failed to calculate daily analytics:",
      error
    );
  }
};

/**
 * Initializes and starts the cron job for daily analytics calculation.
 */
export const startAnalyticsJob = () => {
  console.log("[CRON] Initializing daily analytics job...");
  // Schedule to run every day at 5 minutes past midnight
  cron.schedule("5 0 * * *", calculateDailyAnalytics, {
    scheduled: true,
    timezone: "Asia/Jakarta",
    name: "daily-analytics-job",
  });
  console.log("[CRON] Daily analytics job scheduled to run at 00:05.");
};
