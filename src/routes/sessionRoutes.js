// src/routes/sessionRoutes.js
import express from "express";
import * as sessionController from "../controller/sessionController.js";
import { ownerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Owner-only routes
router.post("/", ownerAuth, sessionController.createSession);
router.post("/batch", ownerAuth, sessionController.createManySessions);
router.put("/:id", ownerAuth, sessionController.updateSession);
router.delete("/:id", ownerAuth, sessionController.deleteSession);
router.put(
  "/:id/booking-status",
  ownerAuth,
  sessionController.updateSessionBookingStatus,
);

// Routes accessible to both owner and customers
// Customers can view available sessions, staff can view their schedule
router.get("/", sessionController.getAllSessions);
router.get("/available", sessionController.getAvailableSessions);
router.get("/:id", sessionController.getSessionById);
router.get("/staff/:staffId", sessionController.getSessionsByStaff);

export default router;
