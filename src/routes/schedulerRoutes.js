// src/routes/schedulerRoutes.js
import express from "express";
import {
  generateSchedule,
  runScheduledGeneration,
  generateScheduleComponents,
  runH1ReminderController,
} from "../controller/schedulerController.js";
import { ownerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// --- Endpoint untuk dipanggil oleh Cron Job Eksternal ---

// Endpoint untuk generate jadwal mingguan
router.get("/cron/generate-schedule", runScheduledGeneration);

// Endpoint untuk mengirim pengingat H-1
router.get("/cron/send-reminders", runH1ReminderController);

// --- Endpoint untuk Owner (dilindungi otentikasi) ---
router.use(ownerAuth);

router.post("/generate", generateSchedule);
router.post("/generate/components", generateScheduleComponents);

export default router;
