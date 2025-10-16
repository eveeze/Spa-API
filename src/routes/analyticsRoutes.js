import { Router } from "express";
import {
  getAnalyticsOverview,
  getAnalyticsDetails,
} from "../controller/analyticsController.js";
import { ownerAuth } from "../middlewares/authMiddleware.js";

const router = Router();

// Route for the main dashboard overview (KPIs, trend chart)
router.get("/overview", ownerAuth, getAnalyticsOverview);

// Route for detailed insights (top services, top staff, etc.)
router.get("/details", ownerAuth, getAnalyticsDetails);

export default router;
