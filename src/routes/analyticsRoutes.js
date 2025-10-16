// src/routes/analyticsRoutes.js
import { Router } from "express";
import {
  getAnalyticsOverview,
  getAnalyticsDetails,
} from "../controller/analyticsController.js";
import { ownerAuth } from "../middlewares/authMiddleware.js";

const router = Router();

// Semua rute di file ini memerlukan otentikasi sebagai owner
router.use(ownerAuth);

// Rute untuk data KPI utama di dashboard (on-the-go)
router.get("/overview", getAnalyticsOverview);

// Rute untuk data detail seperti grafik dan daftar performa
// Bisa menerima query parameter ?days=... untuk mengubah rentang waktu
router.get("/details", getAnalyticsDetails);

export default router;
