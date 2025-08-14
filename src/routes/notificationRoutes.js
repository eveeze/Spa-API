// src/routes/notificationRoutes.js
import express from "express";
import { getNotifications } from "../controller/notificationController.js";
import { combinedAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", combinedAuth, getNotifications);
router.patch("/:notificationId/read", combinedAuth, markAsRead);

export default router;
