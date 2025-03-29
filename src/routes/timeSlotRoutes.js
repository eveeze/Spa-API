// src/routes/timeSlotRoutes.js
import express from "express";
import timeSlotController from "../controller/timeSlotController.js";
import { ownerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();
// owner routes
router.post("/", ownerAuth, timeSlotController.createNewTimeSlot);
router.put("/:id", ownerAuth, timeSlotController.updateTimeSlotHandler);
router.delete("/:id", ownerAuth, timeSlotController.deleteTimeSlotHandler);
router.post(
  "/bulk",
  ownerAuth,
  timeSlotController.createMultipleTimeSlotsHandler,
);

// public routes
router.get("/", timeSlotController.getAllTimeSlotsHandler);
router.get("/:id", timeSlotController.getTimeSlotByIdHandler);
router.get(
  "/schedule/:scheduleId",
  timeSlotController.getTimeSlotsByScheduleIdHandler,
);
router.get("/available/:date", timeSlotController.getAvailableTimeSlotsHandler);

export default router;
