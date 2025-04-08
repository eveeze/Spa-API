// src/repository/timeSlotRepository.js
import prisma from "../config/db.js";

/**
 * Create a new time slot
 * @param {Object} data - Time slot data
 * @returns {Promise<Object>} Created time slot
 */
const createTimeSlot = async (data) => {
  return await prisma.timeSlot.create({
    data: {
      operatingScheduleId: data.operatingScheduleId,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
    },
    include: {
      operatingSchedule: true,
      sessions: true,
    },
  });
};

/**
 * Get all time slots with optional filters
 * @param {Object} filters - Optional filter parameters
 * @returns {Promise<Array>} List of time slots
 */
const getAllTimeSlots = async (filters = {}) => {
  const { operatingScheduleId, date, startTime, endTime } = filters;

  let where = {};

  // Filter by operating schedule ID
  if (operatingScheduleId) {
    where.operatingScheduleId = operatingScheduleId;
  }

  // Filter by date (through operating schedule)
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    where.operatingSchedule = {
      date: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };
  }

  // Filter by time range
  if (startTime) {
    where.startTime = {
      gte: new Date(startTime),
    };
  }

  if (endTime) {
    where.endTime = {
      lte: new Date(endTime),
    };
  }

  return await prisma.timeSlot.findMany({
    where,
    include: {
      operatingSchedule: true,
      sessions: {
        include: {
          staff: true,
          reservation: true,
        },
      },
    },
    orderBy: {
      startTime: "asc",
    },
  });
};

/**
 * Get time slot by ID
 * @param {String} id - Time slot ID
 * @returns {Promise<Object|null>} Time slot or null if not found
 */
const getTimeSlotById = async (id) => {
  return await prisma.timeSlot.findUnique({
    where: { id },
    include: {
      operatingSchedule: true,
      sessions: {
        include: {
          staff: true,
          reservation: true,
        },
      },
    },
  });
};

/**
 * Get time slots by operating schedule ID
 * @param {String} operatingScheduleId - Operating schedule ID
 * @returns {Promise<Array>} List of time slots
 */
const getTimeSlotsByScheduleId = async (operatingScheduleId) => {
  return await prisma.timeSlot.findMany({
    where: { operatingScheduleId },
    include: {
      sessions: {
        include: {
          staff: true,
          reservation: true,
        },
      },
    },
    orderBy: {
      startTime: "asc",
    },
  });
};

/**
 * Check if a time slot already exists for the given schedule and time range
 * @param {String} operatingScheduleId - Operating schedule ID
 * @param {Date} startTime - Start time
 * @param {Date} endTime - End time
 * @param {String} excludeId - Optional time slot ID to exclude from the check
 * @returns {Promise<Object|null>} Existing time slot or null
 */
const getExistingTimeSlot = async (
  operatingScheduleId,
  startTime,
  endTime,
  excludeId = null,
) => {
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  // Build the where clause
  let where = {
    operatingScheduleId,
    OR: [
      // Modified overlap condition: slots overlap if one starts before the other ends AND ends after the other starts
      {
        startTime: { lt: endDate },
        endTime: { gt: startDate },
      },
    ],
  };

  // Exclude the time slot with the given ID if provided
  if (excludeId) {
    where.id = { not: excludeId };
  }

  return await prisma.timeSlot.findFirst({
    where,
  });
};
/**
 * Update time slot by ID
 * @param {String} id - Time slot ID
 * @param {Object} data - Updated time slot data
 * @returns {Promise<Object>} Updated time slot
 */
const updateTimeSlot = async (id, data) => {
  const updateData = {};

  if (data.operatingScheduleId !== undefined) {
    updateData.operatingScheduleId = data.operatingScheduleId;
  }

  if (data.startTime !== undefined) {
    updateData.startTime = new Date(data.startTime);
  }

  if (data.endTime !== undefined) {
    updateData.endTime = new Date(data.endTime);
  }

  return await prisma.timeSlot.update({
    where: { id },
    data: updateData,
    include: {
      operatingSchedule: true,
      sessions: true,
    },
  });
};

/**
 * Delete time slot by ID
 * @param {String} id - Time slot ID
 * @returns {Promise<Object>} Deleted time slot
 */
const deleteTimeSlot = async (id) => {
  return await prisma.timeSlot.delete({
    where: { id },
  });
};

/**
 * Get available time slots for a specific date
 * @param {String} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} List of available time slots
 */
const getAvailableTimeSlots = async (date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return await prisma.timeSlot.findMany({
    where: {
      operatingSchedule: {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
        isHoliday: false, // Only get time slots for non-holiday days
      },
      sessions: {
        some: {
          isBooked: false, // Only get time slots with available sessions
        },
      },
    },
    include: {
      operatingSchedule: true,
      sessions: {
        where: {
          isBooked: false,
        },
        include: {
          staff: true,
        },
      },
    },
    orderBy: {
      startTime: "asc",
    },
  });
};

/**
 * Create multiple time slots for an operating schedule
 * @param {String} operatingScheduleId - Operating schedule ID
 * @param {Array} timeSlots - Array of time slot objects with startTime and endTime
 * @returns {Promise<Array>} Created time slots
 */
const createMultipleTimeSlots = async (operatingScheduleId, timeSlots) => {
  const data = timeSlots.map((slot) => ({
    operatingScheduleId,
    startTime: new Date(slot.startTime),
    endTime: new Date(slot.endTime),
  }));

  return await prisma.$transaction(
    data.map((slot) =>
      prisma.timeSlot.create({
        data: slot,
        include: {
          operatingSchedule: true,
        },
      }),
    ),
  );
};

export {
  createTimeSlot,
  getAllTimeSlots,
  getTimeSlotById,
  getTimeSlotsByScheduleId,
  getExistingTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  getAvailableTimeSlots,
  createMultipleTimeSlots,
};
