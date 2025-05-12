// src/routes/schedulerRoutes.js
import express from "express";
import {
  generateSchedule,
  runScheduledGeneration,
  generateScheduleComponents,
} from "../controller/schedulerController.js";
import { ownerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Protected routes (owner only)
router.post("/generate", ownerAuth, generateSchedule);
router.post("/generate/components", ownerAuth, generateScheduleComponents);

// Cron job endpoint - can be protected with a secret key
router.get("/cron", runScheduledGeneration);

export default router;
