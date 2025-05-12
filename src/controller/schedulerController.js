// src/controller/schedulerController.js
import { parseISO, addDays } from "date-fns";
import {
  generateOperatingSchedules,
  generateTimeSlots,
  generateSessions,
  generateFullSchedule,
} from "../repository/schedulerRepository.js";

/**
 * Generate full schedule (operating schedules, time slots, and sessions)
 * for the specified number of days
 */
export const generateSchedule = async (req, res) => {
  try {
    const { startDate, days = 7, holidayDates = [], timeConfig } = req.body;

    // Parse start date or use current date
    const parsedStartDate = startDate ? parseISO(startDate) : new Date();

    // Generate full schedule
    const result = await generateFullSchedule(
      parsedStartDate,
      parseInt(days),
      holidayDates,
      timeConfig || {
        startHour: 7,
        endHour: 15,
        slotDurationMinutes: 60,
      }
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

    // Generate 7 days of schedules
    const result = await generateFullSchedule(startDate, 7);

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
    } = req.body;

    const parsedStartDate = startDate ? parseISO(startDate) : new Date();

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
          timeConfig || {
            startHour: 7,
            endHour: 15,
            slotDurationMinutes: 60,
          }
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
