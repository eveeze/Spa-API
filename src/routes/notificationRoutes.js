// src/routes/notificationRoutes.js
import express from "express";
import { getNotifications } from "../controller/notificationController.js";
import { combinedAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Cukup satu rute untuk semua.
router.get("/", combinedAuth, getNotifications);

export default router;
