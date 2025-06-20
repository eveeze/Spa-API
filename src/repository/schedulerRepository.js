// schedulerRepository.js - FIXED VERSION
import prisma from "../config/db.js";
import { addDays, setHours, setMinutes, parseISO, addMinutes } from "date-fns";

/**
 * Generate operating schedules for the next 7 days
 * @param {Date} startDate - The start date to generate schedules from
 * @param {Number} numberOfDays - Number of days to generate schedules for
 * @param {Array} holidayDates - Array of dates to mark as holidays
 * @returns {Array} Created operating schedules
 */
export const generateOperatingSchedules = async (
  startDate = new Date(),
  numberOfDays = 7,
  holidayDates = []
) => {
  const schedules = [];
  const holidaySet = new Set(
    holidayDates.map((date) => new Date(date).toISOString().split("T")[0])
  );

  for (let i = 0; i < numberOfDays; i++) {
    const currentDate = addDays(startDate, i);
    const dateString = currentDate.toISOString().split("T")[0];
    const isHoliday = holidaySet.has(dateString);

    // Check if schedule already exists for this day
    const existingSchedule = await prisma.operatingSchedule.findFirst({
      where: {
        date: {
          gte: new Date(`${dateString}T00:00:00.000Z`),
          lt: new Date(`${dateString}T23:59:59.999Z`),
        },
      },
    });

    if (existingSchedule) {
      schedules.push(existingSchedule);
      continue;
    }

    // Create new schedule
    const newSchedule = await prisma.operatingSchedule.create({
      data: {
        date: currentDate,
        isHoliday,
        notes: isHoliday ? "Automatically marked as holiday" : null,
      },
    });

    schedules.push(newSchedule);
  }

  return schedules;
};

/**
 * Generate time slots for operating schedules with proper time zone handling
 * @param {Array} operatingSchedules - Array of operating schedule objects
 * @param {Object} timeConfig - Configuration for time slots
 * @param {Number} timeZoneOffset - Timezone offset in hours (from environment variable)
 * @returns {Object} Created time slots grouped by operatingScheduleId
 */
export const generateTimeSlots = async (
  operatingSchedules,
  timeConfig = {
    startHour: 7, // 7 AM WIB (00:00 UTC)
    endHour: 15, // 3 PM WIB (08:00 UTC)
    slotDurationMinutes: 60, // 1 hour slots
  },
  timeZoneOffset = parseInt(process.env.TIMEZONE_OFFSET || "7") // Default to Indonesia time (UTC+7)
) => {
  const timeSlotsBySchedule = {};

  for (const schedule of operatingSchedules) {
    // Skip if it's a holiday
    if (schedule.isHoliday) {
      timeSlotsBySchedule[schedule.id] = [];
      continue;
    }

    const slotsToCreate = [];
    const scheduleDate = new Date(schedule.date);

    // FIXED: Define the proper UTC hour range that corresponds to WIB time range
    // When WIB is 7:00-15:00 (UTC+7), UTC should be 00:00-08:00
    const utcStartHour = timeConfig.startHour - timeZoneOffset; // 7 - 7 = 0
    const utcEndHour = timeConfig.endHour - timeZoneOffset; // 15 - 7 = 8

    // Loop through each hour in the UTC range
    for (let utcHour = utcStartHour; utcHour < utcEndHour; utcHour++) {
      // Create the slot directly in UTC time
      const slotDate = new Date(scheduleDate);
      // Set the UTC hours directly
      slotDate.setUTCHours(utcHour, 0, 0, 0);

      const startTimeUTC = slotDate;

      // Calculate end time (add slot duration)
      const endTimeUTC = new Date(startTimeUTC);
      endTimeUTC.setMinutes(
        endTimeUTC.getMinutes() + timeConfig.slotDurationMinutes
      );

      // Check if time slot already exists
      const existingTimeSlot = await prisma.timeSlot.findFirst({
        where: {
          operatingScheduleId: schedule.id,
          startTime: {
            gte: startTimeUTC,
            lt: new Date(startTimeUTC.getTime() + 1000), // Within 1 second
          },
          endTime: {
            gte: endTimeUTC,
            lt: new Date(endTimeUTC.getTime() + 1000), // Within 1 second
          },
        },
      });

      if (!existingTimeSlot) {
        slotsToCreate.push({
          startTime: startTimeUTC,
          endTime: endTimeUTC,
        });
      }
    }

    if (slotsToCreate.length > 0) {
      await prisma.timeSlot.createMany({
        data: slotsToCreate.map((slot) => ({
          operatingScheduleId: schedule.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
        skipDuplicates: true,
      });

      // Fetch created time slots
      const fetchedTimeSlots = await prisma.timeSlot.findMany({
        where: {
          operatingScheduleId: schedule.id,
        },
      });

      timeSlotsBySchedule[schedule.id] = fetchedTimeSlots;
    } else {
      // Get existing time slots
      const existingTimeSlots = await prisma.timeSlot.findMany({
        where: {
          operatingScheduleId: schedule.id,
        },
      });
      timeSlotsBySchedule[schedule.id] = existingTimeSlots;
    }
  }

  return timeSlotsBySchedule;
};

/**
 * Generate sessions for time slots
 * @param {Object} timeSlotsBySchedule - Time slots grouped by schedule ID
 * @returns {Object} Created sessions grouped by timeSlotId
 */
export const generateSessions = async (timeSlotsBySchedule) => {
  const sessionsByTimeSlot = {};

  // Get all active staff
  const activeStaff = await prisma.staff.findMany({
    where: {
      isActive: true,
    },
  });

  if (activeStaff.length === 0) {
    throw new Error("No active staff available to create sessions");
  }

  for (const scheduleId in timeSlotsBySchedule) {
    const timeSlots = timeSlotsBySchedule[scheduleId];

    for (const timeSlot of timeSlots) {
      const sessionsToCreate = [];

      // Check for existing sessions for each staff
      for (const staff of activeStaff) {
        const existingSession = await prisma.session.findFirst({
          where: {
            timeSlotId: timeSlot.id,
            staffId: staff.id,
          },
        });

        if (!existingSession) {
          sessionsToCreate.push({
            timeSlotId: timeSlot.id,
            staffId: staff.id,
            isBooked: false,
          });
        }
      }

      if (sessionsToCreate.length > 0) {
        await prisma.session.createMany({
          data: sessionsToCreate,
          skipDuplicates: true,
        });
      }

      // Fetch all sessions for this time slot
      const sessions = await prisma.session.findMany({
        where: {
          timeSlotId: timeSlot.id,
        },
        include: {
          staff: {
            select: {
              id: true,
              name: true,
              email: true,
              profilePicture: true,
            },
          },
        },
      });

      sessionsByTimeSlot[timeSlot.id] = sessions;
    }
  }

  return sessionsByTimeSlot;
};

/**
 * Generate full schedule (operating schedules, time slots, and sessions)
 * @param {Date} startDate - Start date for schedule generation
 * @param {Number} days - Number of days to generate
 * @param {Array} holidayDates - Dates to mark as holidays
 * @param {Object} timeConfig - Time slot configuration
 * @param {Number} timeZoneOffset - Timezone offset from environment variable
 * @returns {Object} Generated schedules, time slots, and sessions
 */
export const generateFullSchedule = async (
  startDate = new Date(),
  days = 7,
  holidayDates = [],
  timeConfig = {
    startHour: 7, // 7 AM WIB (00:00 UTC)
    endHour: 15, // 3 PM WIB (08:00 UTC)
    slotDurationMinutes: 60,
  },
  timeZoneOffset = parseInt(process.env.TIMEZONE_OFFSET || "7") // Default to Indonesia time (UTC+7)
) => {
  // Generate operating schedules
  const operatingSchedules = await generateOperatingSchedules(
    startDate,
    days,
    holidayDates
  );

  // Generate time slots for each operating schedule with proper time zone handling
  const timeSlotsBySchedule = await generateTimeSlots(
    operatingSchedules,
    timeConfig,
    timeZoneOffset
  );

  // Generate sessions for each time slot
  const sessionsByTimeSlot = await generateSessions(timeSlotsBySchedule);

  return {
    operatingSchedules,
    timeSlotsBySchedule,
    sessionsByTimeSlot,
  };
};
