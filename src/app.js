// app.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import paymentScheduler from "./config/paymentScheduler.js";
import http from "http";
import { Server } from "socket.io";
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
import notificationRoutes from "./routes/notificationRoutes.js";
import ratingRoutes from "./routes/ratingRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // Event untuk mendaftarkan user yang online
  socket.on("addNewUser", (userId) => {
    onlineUsers.set(userId, socket.id);
    console.log("Online users:", Array.from(onlineUsers.keys()));
  });

  socket.on("disconnect", () => {
    // Hapus user dari daftar onlineUsers saat disconnect
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    console.log(`User Disconnected: ${socket.id}`);
    console.log("Online users:", Array.from(onlineUsers.keys()));
  });
});

// Teruskan instance io dan onlineUsers ke app object agar bisa diakses di controller
app.set("socketio", io);
app.set("onlineUsers", onlineUsers);

// define routes
app.use("/api/customer", customerRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/service-category", serviceCategoryRoutes);
app.use("/api/service", serviceRoutes);
app.use("/api/operating-schedule", operatingScheduleRoutes);
app.use("/api/time-slot", timeSlotRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/scheduler", schedulerRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/analytics", analyticsRoutes);
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("Selamat datang di API Ema Baby Spa");
});

// Graceful shutdown handler
const gracefulShutdown = () => {
  console.log("\n[SHUTDOWN] Received shutdown signal...");
  paymentScheduler.clearAllTimers();
  console.log("[SHUTDOWN] Cleanup completed");
  process.exit(0);
};

// Handle shutdown signals
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

app.listen(PORT, async () => {
  console.log(`Server sudah berjalan di port: ${PORT}`);

  try {
    // Inisialisasi payment scheduler (bukan cron job, ini untuk real-time expiry)
    console.log("[STARTUP] Initializing payment scheduler...");
    paymentScheduler.startCleanupJob();
    await paymentScheduler.initializePendingPayments();
    console.log("[STARTUP] Payment scheduler initialized successfully.");
    console.log(`[STARTUP] Scheduler stats:`, paymentScheduler.getStats());
  } catch (error) {
    console.error(
      "[STARTUP ERROR] Failed to initialize payment scheduler:",
      error
    );
  }
});

export default app;
