// src/repository/sessionRepository.js
import prisma from "../config/db.js";

/**
 * Creates a new session in the database
 * @param {Object} sessionData - The session data to be created
 * @returns {Promise<Object>} The created session
 */
export const createSession = async (sessionData) => {
  return await prisma.session.create({
    data: sessionData,
    include: {
      timeSlot: true,
      staff: true,
    },
  });
};

/**
 * Creates multiple sessions at once
 * @param {Array} sessionsData - Array of session data objects to be created
 * @returns {Promise<Array>} The created sessions
 */
export const createManySessions = async (sessionsData) => {
  return await prisma.$transaction(async (tx) => {
    const createdSessions = [];
    for (const sessionData of sessionsData) {
      const session = await tx.session.create({
        data: sessionData,
        include: {
          timeSlot: true,
          staff: true,
        },
      });
      createdSessions.push(session);
    }
    return createdSessions;
  });
};

/**
 * Gets all sessions with optional filtering
 * @param {Object} options - Filter options
 * @param {Boolean} options.isBooked - Filter by booking status
 * @param {String} options.staffId - Filter by staff ID
 * @param {String} options.timeSlotId - Filter by time slot ID
 * @param {Date} options.date - Filter by date
 * @returns {Promise<Array>} List of sessions matching criteria
 */
export const getAllSessions = async (options = {}) => {
  const { isBooked, staffId, timeSlotId, date } = options;

  // Build filter conditions based on provided options
  const where = {};

  if (isBooked !== undefined) {
    where.isBooked = isBooked;
  }

  if (staffId) {
    where.staffId = staffId;
  }

  if (timeSlotId) {
    where.timeSlotId = timeSlotId;
  }

  // If date is provided, we need to join with timeSlot and filter by date
  let sessionQuery = {
    where,
    include: {
      timeSlot: {
        include: {
          operatingSchedule: true,
        },
      },
      staff: true,
      reservation: date ? true : false, // Only include reservation if we're filtering by date
    },
    orderBy: {
      timeSlot: {
        startTime: "asc",
      },
    },
  };

  let sessions = await prisma.session.findMany(sessionQuery);

  // If date is provided, filter sessions based on the date
  if (date) {
    const filterDate = new Date(date);
    filterDate.setHours(0, 0, 0, 0); // Set to start of day

    // Get the next day
    const nextDay = new Date(filterDate);
    nextDay.setDate(nextDay.getDate() + 1);

    sessions = sessions.filter((session) => {
      const sessionDate = new Date(session.timeSlot.operatingSchedule.date);
      sessionDate.setHours(0, 0, 0, 0); // Set to start of day
      return sessionDate.getTime() === filterDate.getTime();
    });
  }

  return sessions;
};

/**
 * Gets a session by its ID
 * @param {String} id - The session ID
 * @returns {Promise<Object|null>} The session or null if not found
 */
export const getSessionById = async (id) => {
  return await prisma.session.findUnique({
    where: { id },
    include: {
      timeSlot: {
        include: {
          operatingSchedule: true,
        },
      },
      staff: true,
      //service: true,
      reservation: true,
    },
  });
};

/**
 * Updates a session by its ID
 * @param {String} id - The session ID
 * @param {Object} updateData - The data to update
 * @returns {Promise<Object>} The updated session
 */
export const updateSession = async (id, updateData) => {
  return await prisma.session.update({
    where: { id },
    data: updateData,
    include: {
      timeSlot: true,
      staff: true,
    },
  });
};

/**
 * Deletes a session by its ID
 * @param {String} id - The session ID
 * @returns {Promise<Object>} The deleted session
 */
export const deleteSession = async (id) => {
  return await prisma.session.delete({
    where: { id },
  });
};

/**
 * Gets available sessions for a specific date that are not booked
 * @param {String} date - The date to check in ISO format (YYYY-MM-DD)
 * @param {Number} duration - Service duration in minutes
 * @returns {Promise<Array>} List of available sessions
 */
export const getAvailableSessions = async (date, duration) => {
  const filterDate = new Date(date);
  filterDate.setHours(0, 0, 0, 0); // Set to start of day

  // Get the next day
  const nextDay = new Date(filterDate);
  nextDay.setDate(nextDay.getDate() + 1);

  // First, get the operating schedule for the requested date
  const operatingSchedule = await prisma.operatingSchedule.findFirst({
    where: {
      date: {
        gte: filterDate,
        lt: nextDay,
      },
      isHoliday: false, // Not a holiday
    },
    include: {
      timeSlots: {
        include: {
          sessions: {
            where: {
              isBooked: false, // Only include sessions that are not booked
            },
            include: {
              staff: true,
            },
          },
        },
        orderBy: {
          startTime: "asc",
        },
      },
    },
  });

  if (!operatingSchedule) {
    return []; // No operating schedule found for this date
  }

  // Filter time slots based on the service duration
  // Only include time slots that can accommodate the service duration
  const availableSessions = [];

  operatingSchedule.timeSlots.forEach((timeSlot) => {
    // Calculate time slot duration in minutes
    const startTime = new Date(timeSlot.startTime);
    const endTime = new Date(timeSlot.endTime);
    const timeSlotDuration = (endTime - startTime) / (1000 * 60); // Convert to minutes

    // Only include if time slot is long enough for the service
    if (timeSlotDuration >= duration && timeSlot.sessions.length > 0) {
      timeSlot.sessions.forEach((session) => {
        availableSessions.push({
          ...session,
          timeSlot: {
            ...timeSlot,
            operatingSchedule: {
              id: operatingSchedule.id,
              date: operatingSchedule.date,
            },
          },
        });
      });
    }
  });

  return availableSessions;
};

/**
 * Updates booking status of a session
 * @param {String} id - The session ID
 * @param {Boolean} isBooked - The booking status to set
 * @returns {Promise<Object>} The updated session
 */
export const updateSessionBookingStatus = async (id, isBooked) => {
  return await prisma.session.update({
    where: { id },
    data: { isBooked },
    include: {
      timeSlot: true,
      staff: true,
    },
  });
};

/**
 * Gets sessions by staff ID
 * @param {String} staffId - The staff ID
 * @param {Date} startDate - Optional start date for filtering
 * @param {Date} endDate - Optional end date for filtering
 * @returns {Promise<Array>} List of sessions for the staff
 */
export const getSessionsByStaff = async (staffId, startDate, endDate) => {
  const where = { staffId };

  // If date range is provided, filter by date
  if (startDate && endDate) {
    where.timeSlot = {
      operatingSchedule: {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
    };
  }

  return await prisma.session.findMany({
    where,
    include: {
      timeSlot: {
        include: {
          operatingSchedule: true,
        },
      },
      reservation: true,
    },
    orderBy: {
      timeSlot: {
        startTime: "asc",
      },
    },
  });
};
