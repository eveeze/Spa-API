// src/repository/operatingScheduleRepository.js
import prisma from "../config/db.js";

/**
 * Create a new operating schedule
 * @param {Object} scheduleData - Operating schedule data
 * @returns {Promise<Object>} Created operating schedule
 */
export const createOperatingSchedule = async (scheduleData) => {
  return await prisma.operatingSchedule.create({
    data: scheduleData,
    include: {
      timeSlots: true,
    },
  });
};

/**
 * Get all operating schedules
 * @param {Object} options - Query options
 * @returns {Promise<Array>} List of operating schedules
 */
export const getAllOperatingSchedules = async (options = {}) => {
  const { date, isHoliday, startDate, endDate } = options;

  const queryOptions = {
    where: {},
    include: {
      timeSlots: true,
    },
    orderBy: {
      date: "asc",
    },
  };

  // Filter by specific date
  if (date) {
    queryOptions.where.date = new Date(date);
  }

  // Filter by date range
  if (startDate && endDate) {
    queryOptions.where.date = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  // Filter by holiday status if specified
  if (isHoliday !== undefined) {
    queryOptions.where.isHoliday = isHoliday === "true" || isHoliday === true;
  }

  return await prisma.operatingSchedule.findMany(queryOptions);
};

/**
 * Get operating schedule by ID
 * @param {String} id - Operating schedule ID
 * @returns {Promise<Object|null>} Operating schedule or null if not found
 */
export const getOperatingScheduleById = async (id) => {
  return await prisma.operatingSchedule.findUnique({
    where: { id },
    include: {
      timeSlots: {
        include: {
          sessions: {
            include: {
              staff: true,
              reservation: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Get operating schedule by date
 * @param {Date} date - Date to find
 * @returns {Promise<Object|null>} Operating schedule or null if not found
 */
export const getOperatingScheduleByDate = async (date) => {
  return await prisma.operatingSchedule.findUnique({
    where: { date: new Date(date) },
    include: {
      timeSlots: {
        include: {
          sessions: {
            include: {
              staff: true,
              reservation: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Update operating schedule by ID
 * @param {String} id - Operating schedule ID
 * @param {Object} scheduleData - Updated operating schedule data
 * @returns {Promise<Object>} Updated operating schedule
 */
export const updateOperatingSchedule = async (id, scheduleData) => {
  return await prisma.operatingSchedule.update({
    where: { id },
    data: scheduleData,
    include: {
      timeSlots: true,
    },
  });
};

/**
 * Delete operating schedule by ID
 * @param {String} id - Operating schedule ID
 * @returns {Promise<Object>} Deleted operating schedule
 */
export const deleteOperatingSchedule = async (id) => {
  return await prisma.operatingSchedule.delete({
    where: { id },
  });
};

/**
 * Toggle holiday status
 * @param {String} id - Operating schedule ID
 * @param {Boolean} isHoliday - New holiday status
 * @returns {Promise<Object>} Updated operating schedule
 */
export const toggleHolidayStatus = async (id, isHoliday) => {
  return await prisma.operatingSchedule.update({
    where: { id },
    data: { isHoliday },
    include: {
      timeSlots: true,
    },
  });
};
