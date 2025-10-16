import {
  getDashboardOverview,
  getDetailedInsights,
} from "../repository/analyticsRepository.js";

/**
 * Handles request for the main analytics dashboard overview.
 */
export const getAnalyticsOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate query parameters are required.",
      });
    }

    const overviewData = await getDashboardOverview(
      new Date(startDate),
      new Date(endDate)
    );

    res.status(200).json({
      success: true,
      message: "Analytics overview retrieved successfully.",
      data: overviewData,
    });
  } catch (error) {
    console.error("[ANALYTICS OVERVIEW ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve analytics overview.",
    });
  }
};

/**
 * Handles request for detailed analytics insights.
 */
export const getAnalyticsDetails = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate query parameters are required.",
      });
    }

    const detailedData = await getDetailedInsights(
      new Date(startDate),
      new Date(endDate)
    );

    res.status(200).json({
      success: true,
      message: "Detailed analytics insights retrieved successfully.",
      data: detailedData,
    });
  } catch (error) {
    console.error("[ANALYTICS DETAILS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve detailed insights.",
    });
  }
};
