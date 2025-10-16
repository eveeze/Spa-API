// src/controller/analyticsController.js

import {
  getDashboardOverview,
  getRevenueChartData,
  getTopPerformingServices,
  getTopPerformingStaff,
  getReservationStats,
  getServiceRatingStats, // <-- Impor fungsi baru
} from "../repository/analyticsRepository.js";
import { startOfDay, endOfDay, subDays } from "date-fns";

/**
 * Handler untuk mendapatkan data overview dashboard utama.
 * Termasuk KPI real-time seperti pendapatan hari ini.
 */
export const getAnalyticsOverview = async (req, res) => {
  try {
    const overviewData = await getDashboardOverview();

    res.status(200).json({
      success: true,
      message: "Analytics overview retrieved successfully.",
      data: overviewData,
    });
  } catch (error) {
    console.error("[GET ANALYTICS OVERVIEW ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve analytics overview.",
    });
  }
};

/**
 * Handler untuk mendapatkan data analitik yang lebih detail
 * seperti grafik, layanan terlaris, dan staf terbaik.
 */
export const getAnalyticsDetails = async (req, res) => {
  try {
    // Tentukan rentang waktu (default: 7 hari terakhir)
    const days = req.query.days ? parseInt(req.query.days) : 7;
    const endDate = endOfDay(new Date());
    const startDate = startOfDay(subDays(endDate, days - 1));

    // Panggil semua fungsi repository secara paralel untuk efisiensi
    const [
      revenueChart,
      topServices,
      topStaff,
      reservationStats,
      ratingStats, // <-- Panggil fungsi baru
    ] = await Promise.all([
      getRevenueChartData(days),
      getTopPerformingServices(5, startDate, endDate),
      getTopPerformingStaff(5, startDate, endDate),
      getReservationStats(startDate, endDate),
      getServiceRatingStats(5), // <-- Tambahkan ini
    ]);

    res.status(200).json({
      success: true,
      message: `Detailed analytics for the last ${days} days retrieved successfully.`,
      data: {
        period: {
          startDate,
          endDate,
        },
        reservationStats: reservationStats,
        revenueChartData: revenueChart,
        topPerformingServices: topServices,
        topPerformingStaff: topStaff,
        ratingStats: ratingStats, // <-- Tambahkan hasilnya ke response
      },
    });
  } catch (error) {
    console.error("[GET ANALYTICS DETAILS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve detailed analytics.",
    });
  }
};
