// schedulerController.js - FIXED VERSION
import { parseISO, addDays } from "date-fns";
import {
  generateOperatingSchedules,
  generateTimeSlots,
  generateSessions,
  generateFullSchedule,
} from "../repository/schedulerRepository.js";
import prisma from "../config/db.js";
import dotenv from "dotenv";

// Ensure environment variables are loaded
dotenv.config();

/**
 * Generate full schedule (operating schedules, time slots, and sessions)
 * for the specified number of days
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

    // Get timezone offset from environment or use provided value or default
    const tzOffset =
      timeZoneOffset !== undefined
        ? parseInt(timeZoneOffset)
        : process.env.TIMEZONE_OFFSET
        ? parseInt(process.env.TIMEZONE_OFFSET)
        : 7; // Default to Indonesia time (UTC+7)

    // Parse start date or use current date
    const parsedStartDate = startDate ? parseISO(startDate) : new Date();

    // Use updated timeConfig with WIB time range (7-15) which will be converted to UTC (0-8)
    const defaultTimeConfig = {
      startHour: 7, // 7 AM WIB
      endHour: 15, // 3 PM WIB
      slotDurationMinutes: 60,
    };

    // Generate full schedule with timezone support
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
 * Run the schedule generation as a scheduled task
 * This is meant to be called by a CRON job
 */
export const runScheduledGeneration = async (req, res) => {
  try {
    // Verify secret key for additional security (optional)
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

    // Start from tomorrow to avoid duplicate schedules
    const startDate = addDays(new Date(), 1);

    // Get timezone offset from environment or use default Indonesia timezone (UTC+7)
    const timeZoneOffset = process.env.TIMEZONE_OFFSET
      ? parseInt(process.env.TIMEZONE_OFFSET)
      : 7;

    // Default time config for WIB time range 07:00-15:00
    const defaultTimeConfig = {
      startHour: 7, // 7 AM WIB
      endHour: 15, // 3 PM WIB
      slotDurationMinutes: 60,
    };

    // Generate 7 days of schedules with proper timezone handling
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
 * Generate specific components (only operating schedules, or only time slots)
 */
export const generateScheduleComponents = async (req, res) => {
  try {
    const {
      component, // 'operatingSchedules', 'timeSlots', or 'sessions'
      scheduleIds,
      startDate,
      days = 7,
      holidayDates = [],
      timeConfig,
      timeZoneOffset,
    } = req.body;

    // Get timezone offset from environment or use provided value or default
    const tzOffset =
      timeZoneOffset !== undefined
        ? parseInt(timeZoneOffset)
        : process.env.TIMEZONE_OFFSET
        ? parseInt(process.env.TIMEZONE_OFFSET)
        : 7; // Default to Indonesia time (UTC+7)

    const parsedStartDate = startDate ? parseISO(startDate) : new Date();

    // Default time config for WIB time range 07:00-15:00
    const defaultTimeConfig = {
      startHour: 7, // 7 AM WIB
      endHour: 15, // 3 PM WIB
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

        // Fetch operating schedules by their IDs
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
