// src/controller/schedulerController.js
import { parseISO, addDays } from "date-fns";
import {
  generateOperatingSchedules,
  generateTimeSlots,
  generateSessions,
  generateFullSchedule,
} from "../repository/schedulerRepository.js";
import { runH1Reminder } from "../config/cronScheduler.js";
import prisma from "../config/db.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * [TIDAK BERUBAH] Generate full schedule for the specified number of days
 */
export const generateSchedule = async (req, res) => {
  try {
    const {
      startDate,
      days = 7,
      holidayDates = [],
      timeConfig,
      timeZoneOffset,
    } = req.body;

    const tzOffset =
      timeZoneOffset !== undefined
        ? parseInt(timeZoneOffset)
        : process.env.TIMEZONE_OFFSET
        ? parseInt(process.env.TIMEZONE_OFFSET)
        : 7;

    const parsedStartDate = startDate ? parseISO(startDate) : new Date();

    const defaultTimeConfig = {
      startHour: 7,
      endHour: 15,
      slotDurationMinutes: 60,
    };

    const result = await generateFullSchedule(
      parsedStartDate,
      parseInt(days),
      holidayDates,
      timeConfig || defaultTimeConfig,
      tzOffset
    );

    res.status(201).json({
      success: true,
      message: `Successfully generated schedules for ${days} days`,
      data: {
        schedulesCreated: result.operatingSchedules.length,
        timeSlotsCreated: Object.values(result.timeSlotsBySchedule).flat()
          .length,
        sessionsCreated: Object.values(result.sessionsByTimeSlot).flat().length,
      },
    });
  } catch (error) {
    console.error("[GENERATE SCHEDULE ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate schedule",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * [TIDAK BERUBAH] Run the schedule generation as a scheduled task
 */
export const runScheduledGeneration = async (req, res) => {
  try {
    const { secret } = req.query;

    if (
      process.env.SCHEDULER_SECRET &&
      secret !== process.env.SCHEDULER_SECRET
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const startDate = addDays(new Date(), 1);
    const timeZoneOffset = process.env.TIMEZONE_OFFSET
      ? parseInt(process.env.TIMEZONE_OFFSET)
      : 7;
    const defaultTimeConfig = {
      startHour: 7,
      endHour: 15,
      slotDurationMinutes: 60,
    };

    const result = await generateFullSchedule(
      startDate,
      7,
      [],
      defaultTimeConfig,
      timeZoneOffset
    );

    res.status(200).json({
      success: true,
      message: "Scheduled generation completed successfully",
      data: {
        schedulesCreated: result.operatingSchedules.length,
        timeSlotsCreated: Object.values(result.timeSlotsBySchedule).flat()
          .length,
        sessionsCreated: Object.values(result.sessionsByTimeSlot).flat().length,
      },
    });
  } catch (error) {
    console.error("[SCHEDULED GENERATION ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to run scheduled generation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * [BARU] Menjalankan tugas pengiriman pengingat H-1 melalui trigger API.
 */
export const runH1ReminderController = async (req, res) => {
  try {
    const { secret } = req.query;

    // Amankan endpoint ini dengan secret key
    if (
      process.env.SCHEDULER_SECRET &&
      secret !== process.env.SCHEDULER_SECRET
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const result = await runH1Reminder();

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[H-1 REMINDER CONTROLLER ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to run H-1 reminder job",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * [TIDAK BERUBAH] Generate specific components
 */
export const generateScheduleComponents = async (req, res) => {
  try {
    const {
      component,
      scheduleIds,
      startDate,
      days = 7,
      holidayDates = [],
      timeConfig,
      timeZoneOffset,
    } = req.body;

    const tzOffset =
      timeZoneOffset !== undefined
        ? parseInt(timeZoneOffset)
        : process.env.TIMEZONE_OFFSET
        ? parseInt(process.env.TIMEZONE_OFFSET)
        : 7;

    const parsedStartDate = startDate ? parseISO(startDate) : new Date();

    const defaultTimeConfig = {
      startHour: 7,
      endHour: 15,
      slotDurationMinutes: 60,
    };

    let result = {};

    switch (component) {
      case "operatingSchedules":
        const schedules = await generateOperatingSchedules(
          parsedStartDate,
          parseInt(days),
          holidayDates
        );
        result = { operatingSchedules: schedules };
        break;

      case "timeSlots":
        if (
          !scheduleIds ||
          !Array.isArray(scheduleIds) ||
          scheduleIds.length === 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Schedule IDs are required to generate time slots",
          });
        }

        const operatingSchedules = await Promise.all(
          scheduleIds.map(async (id) => {
            return await prisma.operatingSchedule.findUnique({
              where: { id },
            });
          })
        );

        const timeSlots = await generateTimeSlots(
          operatingSchedules.filter(Boolean),
          timeConfig || defaultTimeConfig,
          tzOffset
        );
        result = { timeSlotsBySchedule: timeSlots };
        break;

      case "sessions":
        if (!req.body.timeSlotsBySchedule) {
          return res.status(400).json({
            success: false,
            message: "Time slots by schedule are required to generate sessions",
          });
        }

        const sessions = await generateSessions(req.body.timeSlotsBySchedule);
        result = { sessionsByTimeSlot: sessions };
        break;

      default:
        return res.status(400).json({
          success: false,
          message:
            "Invalid component specified. Use 'operatingSchedules', 'timeSlots', or 'sessions'",
        });
    }

    res.status(201).json({
      success: true,
      message: `Successfully generated ${component}`,
      data: result,
    });
  } catch (error) {
    console.error(
      `[GENERATE ${req.body.component?.toUpperCase()} ERROR]:`,
      error
    );
    res.status(500).json({
      success: false,
      message: `Failed to generate ${req.body.component}`,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
