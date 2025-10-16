// src/routes/notificationRoutes.js

import express from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead, // <-- Impor fungsi baru
} from "../controller/notificationController.js";
import { combinedAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", combinedAuth, getNotifications);

router.patch("/read-all", combinedAuth, markAllAsRead);

router.patch("/:notificationId/read", combinedAuth, markAsRead);

export default router;
