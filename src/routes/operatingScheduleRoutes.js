// src/routes/operatingScheduleRoutes.js
import express from "express";
import operatingScheduleController from "../controller/operatingScheduleController.js";
import { ownerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Apply owner authentication middleware to all routes
router.use(ownerAuth);

// Create a new operating schedule
router.post("/", operatingScheduleController.createNewOperatingSchedule);

// Get all operating schedules
router.get("/", operatingScheduleController.getAllSchedules);

// Get operating schedule by ID
router.get("/:id", operatingScheduleController.getScheduleById);

// Get operating schedule by date
router.get("/date/:date", operatingScheduleController.getScheduleByDate);

// Update operating schedule
router.put("/:id", operatingScheduleController.updateSchedule);

// Delete operating schedule
router.delete("/:id", operatingScheduleController.deleteSchedule);

// Toggle holiday status
router.patch("/:id/toggle-holiday", operatingScheduleController.toggleHoliday);

export default router;
