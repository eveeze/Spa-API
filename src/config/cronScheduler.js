// src/config/cronScheduler.js
import cron from "node-cron";
import axios from "axios";
import dotenv from "dotenv";
import crypto from "node:crypto"; // <-- TAMBAHKAN BARIS INI

dotenv.config();

/**
 * Initialize cron jobs
 * @param {String} apiBaseUrl - The base URL of the API
 */
export const initCronJobs = (apiBaseUrl) => {
  // Schedule to run every Sunday at midnight (0 0 * * 0)
  cron.schedule("0 0 * * 0", async () => {
    console.log(
      "[CRON] Running scheduled generation at",
      new Date().toISOString()
    );

    try {
      const secret = process.env.SCHEDULER_SECRET || "default-secret";
      const response = await axios.get(
        `${apiBaseUrl}/api/scheduler/cron?secret=${secret}`
      );

      console.log("[CRON] Scheduled generation result:", response.data);
    } catch (error) {
      console.error("[CRON] Scheduled generation failed:", error.message);
    }
  });

  console.log("[CRON] Schedule generation job initialized");
};

/**
 * Run the schedule generation manually
 * @returns {Promise} The result of the schedule generation
 */
export const runManualGeneration = async () => {
  try {
    const secret = process.env.SCHEDULER_SECRET || "default-secret";
    const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:5000";

    const response = await axios.get(
      `${apiBaseUrl}/api/scheduler/cron?secret=${secret}`
    );
    return response.data;
  } catch (error) {
    console.error("[MANUAL CRON] Generation failed:", error.message);
    throw error;
  }
};
