// app.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initCronJobs } from "./config/cronScheduler.js";
// import routes
import customerRoutes from "./routes/customerRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import serviceCategoryRoutes from "./routes/serviceCategoryRoutes.js";
import operatingScheduleRoutes from "./routes/operatingScheduleRoutes.js";
import timeSlotRoutes from "./routes/timeSlotRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import reservationRoutes from "./routes/reservationRoutes.js";
import schedulerRoutes from "./routes/schedulerRoutes.js";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// define routes
app.use("/api/customer", customerRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/service-category", serviceCategoryRoutes);
app.use("/api/service", serviceRoutes);
app.use("/api/operating-schedule", operatingScheduleRoutes);
app.use("/api/time-slot", timeSlotRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/scheduler", schedulerRoutes);
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("selamat datang di api ema baby spa");
});

app.listen(PORT, () => {
  console.log(`Server sudah berjalan di port : ${PORT}`);

  const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${PORT}`;
  initCronJobs(apiBaseUrl);
  console.log("[CRON] Scheduler initialized");
});

export default app;
