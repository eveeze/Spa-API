// src/controller/sessionController.js
import * as sessionRepository from "../repository/sessionRepository.js";

/**
 * Create a new session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createSession = async (req, res) => {
  try {
    const sessionData = req.body;
    const session = await sessionRepository.createSession(sessionData);

    res.status(201).json({
      success: true,
      message: "Session created successfully",
      data: session,
    });
  } catch (error) {
    console.error("[CREATE SESSION ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create session",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Create multiple sessions at once
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createManySessions = async (req, res) => {
  try {
    const { sessions } = req.body;

    if (!Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid input. Expected an array of session data",
      });
    }

    const createdSessions =
      await sessionRepository.createManySessions(sessions);

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdSessions.length} sessions`,
      data: createdSessions,
    });
  } catch (error) {
    console.error("[CREATE MANY SESSIONS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create sessions",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get all sessions with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getAllSessions = async (req, res) => {
  try {
    const { isBooked, staffId, timeSlotId, date } = req.query;

    // Convert string 'true'/'false' to boolean
    let isBookedBool;
    if (isBooked !== undefined) {
      isBookedBool = isBooked === "true";
    }

    const sessions = await sessionRepository.getAllSessions({
      isBooked: isBookedBool,
      staffId,
      timeSlotId,
      date,
    });

    res.status(200).json({
      success: true,
      message: "Sessions retrieved successfully",
      count: sessions.length,
      data: sessions,
    });
  } catch (error) {
    console.error("[GET ALL SESSIONS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve sessions",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get a session by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getSessionById = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await sessionRepository.getSessionById(id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Session retrieved successfully",
      data: session,
    });
  } catch (error) {
    console.error("[GET SESSION BY ID ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve session",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Update a session by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateSession = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if session exists
    const existingSession = await sessionRepository.getSessionById(id);
    if (!existingSession) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const updatedSession = await sessionRepository.updateSession(
      id,
      updateData,
    );

    res.status(200).json({
      success: true,
      message: "Session updated successfully",
      data: updatedSession,
    });
  } catch (error) {
    console.error("[UPDATE SESSION ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update session",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Delete a session by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const deleteSession = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if session exists
    const existingSession = await sessionRepository.getSessionById(id);
    if (!existingSession) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Check if session is already booked
    if (existingSession.isBooked) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a booked session",
      });
    }

    await sessionRepository.deleteSession(id);

    res.status(200).json({
      success: true,
      message: "Session deleted successfully",
    });
  } catch (error) {
    console.error("[DELETE SESSION ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete session",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get available sessions for a specific date
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getAvailableSessions = async (req, res) => {
  try {
    const { date, duration } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required",
      });
    }

    // Default duration to 60 minutes if not specified
    const serviceDuration = duration ? parseInt(duration) : 60;

    const availableSessions = await sessionRepository.getAvailableSessions(
      date,
      serviceDuration,
    );

    res.status(200).json({
      success: true,
      message: "Available sessions retrieved successfully",
      count: availableSessions.length,
      data: availableSessions,
    });
  } catch (error) {
    console.error("[GET AVAILABLE SESSIONS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve available sessions",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Update session booking status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateSessionBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBooked } = req.body;

    if (isBooked === undefined) {
      return res.status(400).json({
        success: false,
        message: "isBooked status is required",
      });
    }

    // Check if session exists
    const existingSession = await sessionRepository.getSessionById(id);
    if (!existingSession) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const updatedSession = await sessionRepository.updateSessionBookingStatus(
      id,
      isBooked,
    );

    res.status(200).json({
      success: true,
      message: `Session ${isBooked ? "booked" : "unbooked"} successfully`,
      data: updatedSession,
    });
  } catch (error) {
    console.error("[UPDATE SESSION BOOKING STATUS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update session booking status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get sessions by staff ID with optional date range
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getSessionsByStaff = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { startDate, endDate } = req.query;

    const sessions = await sessionRepository.getSessionsByStaff(
      staffId,
      startDate,
      endDate,
    );

    res.status(200).json({
      success: true,
      message: "Staff sessions retrieved successfully",
      count: sessions.length,
      data: sessions,
    });
  } catch (error) {
    console.error("[GET SESSIONS BY STAFF ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve staff sessions",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
