// src/controller/timeSlotController.js
import {
  createTimeSlot,
  getAllTimeSlots,
  getTimeSlotById,
  getTimeSlotsByScheduleId,
  getExistingTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  getAvailableTimeSlots,
  createMultipleTimeSlots,
} from "../repository/timeSlotRepository.js";
import { getOperatingScheduleById } from "../repository/operatingScheduleRepository.js";

/**
 * Check if a time falls on the same date as the operating schedule
 * @param {Date} time - The time to check
 * @param {Date} scheduleDate - The operating schedule date
 * @returns {Boolean} True if the time is on the same date as the schedule
 */

const isOnSameDate = (time, scheduleDate) => {
  // Convert both dates to UTC first to standardize comparison
  const timeDate = new Date(time);
  const scheduleDateObj = new Date(scheduleDate);

  // Extract UTC date components
  const timeYear = timeDate.getUTCFullYear();
  const timeMonth = timeDate.getUTCMonth();
  const timeDay = timeDate.getUTCDate();

  const scheduleYear = scheduleDateObj.getUTCFullYear();
  const scheduleMonth = scheduleDateObj.getUTCMonth();
  const scheduleDay = scheduleDateObj.getUTCDate();

  return (
    timeYear === scheduleYear &&
    timeMonth === scheduleMonth &&
    timeDay === scheduleDay
  );
};
/**
 * Create a new time slot
 */
const createNewTimeSlot = async (req, res) => {
  try {
    const { operatingScheduleId, startTime, endTime } = req.body;

    // Validate required fields
    if (!operatingScheduleId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Operating schedule ID, start time and end time are required",
      });
    }

    // Check if operating schedule exists
    const schedule = await getOperatingScheduleById(operatingScheduleId);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Operating schedule not found",
      });
    }

    // Check if schedule is marked as a holiday
    if (schedule.isHoliday) {
      return res.status(400).json({
        success: false,
        message: "Cannot create time slots for days marked as holidays",
      });
    }

    // Validate time format
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid time format. Please use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)",
      });
    }

    // Ensure end time is after start time
    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time",
      });
    }

    // Check if time slot date and the operating schedule date is same
    if (
      !isOnSameDate(startDate, schedule.date) ||
      !isOnSameDate(endDate, schedule.date)
    ) {
      return res.status(400).json({
        success: false,
        message: "Time slot must be on the same date as the operating schedule",
      });
    }

    // Check if the time slot overlaps with existing time slots
    const existingTimeSlot = await getExistingTimeSlot(
      operatingScheduleId,
      startTime,
      endTime,
    );
    if (existingTimeSlot) {
      return res.status(400).json({
        success: false,
        message: "Time slot overlaps with an existing time slot",
      });
    }

    // Create the time slot
    const newTimeSlot = await createTimeSlot({
      operatingScheduleId,
      startTime,
      endTime,
    });

    res.status(201).json({
      success: true,
      message: "Time slot created successfully",
      data: newTimeSlot,
    });
  } catch (error) {
    console.error("[CREATE TIME SLOT ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create time slot",
    });
  }
};

/**
 * Update time slot by ID
 */
const updateTimeSlotHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { operatingScheduleId, startTime, endTime } = req.body;

    // Check if time slot exists
    const existingTimeSlot = await getTimeSlotById(id);
    if (!existingTimeSlot) {
      return res.status(404).json({
        success: false,
        message: "Time slot not found",
      });
    }

    // Prepare update data
    const updateData = {};
    let scheduleToCheck = await getOperatingScheduleById(
      existingTimeSlot.operatingScheduleId,
    );

    // Check if operating schedule is changing
    if (
      operatingScheduleId &&
      operatingScheduleId !== existingTimeSlot.operatingScheduleId
    ) {
      // Check if the new operating schedule exists
      const schedule = await getOperatingScheduleById(operatingScheduleId);
      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: "New operating schedule not found",
        });
      }

      // Check if the new schedule is a holiday
      if (schedule.isHoliday) {
        return res.status(400).json({
          success: false,
          message: "Cannot assign time slot to a holiday",
        });
      }

      updateData.operatingScheduleId = operatingScheduleId;
      scheduleToCheck = schedule;
    }

    // Process time updates
    const newStartTime = startTime ? new Date(startTime) : null;
    const newEndTime = endTime ? new Date(endTime) : null;

    // Validate time formats if provided
    if (newStartTime && isNaN(newStartTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid start time format",
      });
    }

    if (newEndTime && isNaN(newEndTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid end time format",
      });
    }

    // Use existing times if not provided
    const effectiveStartTime = newStartTime || existingTimeSlot.startTime;
    const effectiveEndTime = newEndTime || existingTimeSlot.endTime;

    // Check start time is before end time
    if (effectiveStartTime >= effectiveEndTime) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time",
      });
    }

    // NEW CHECK: Ensure updated time slot is on the same date as the operating schedule
    if (
      !isOnSameDate(effectiveStartTime, scheduleToCheck.date) ||
      !isOnSameDate(effectiveEndTime, scheduleToCheck.date)
    ) {
      return res.status(400).json({
        success: false,
        message: "Time slot must be on the same date as the operating schedule",
      });
    }

    // Check for overlapping time slots
    if (startTime || endTime || operatingScheduleId) {
      const scheduleIdToCheck =
        operatingScheduleId || existingTimeSlot.operatingScheduleId;
      const existingSlot = await getExistingTimeSlot(
        scheduleIdToCheck,
        effectiveStartTime,
        effectiveEndTime,
        id, // Exclude the current time slot from the check
      );

      if (existingSlot) {
        return res.status(400).json({
          success: false,
          message: "Updated time slot would overlap with an existing time slot",
        });
      }
    }

    // Add times to update data if provided
    if (startTime) updateData.startTime = newStartTime;
    if (endTime) updateData.endTime = newEndTime;

    // Check if there are any sessions with reservations
    const hasBookedSessions = existingTimeSlot.sessions.some(
      (session) => session.isBooked || session.reservation !== null,
    );

    if (hasBookedSessions && (startTime || endTime)) {
      return res.status(400).json({
        success: false,
        message: "Cannot modify time slot with booked sessions",
      });
    }

    // Update time slot
    const updatedTimeSlot = await updateTimeSlot(id, updateData);

    res.status(200).json({
      success: true,
      message: "Time slot updated successfully",
      data: updatedTimeSlot,
    });
  } catch (error) {
    console.error("[UPDATE TIME SLOT ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update time slot",
    });
  }
};

/**
 * Create multiple time slots for an operating schedule
 */
const createMultipleTimeSlotsHandler = async (req, res) => {
  try {
    const { operatingScheduleId, timeSlots } = req.body;

    if (
      !operatingScheduleId ||
      !Array.isArray(timeSlots) ||
      timeSlots.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Operating schedule ID and at least one time slot are required",
      });
    }

    // Check if operating schedule exists
    const schedule = await getOperatingScheduleById(operatingScheduleId);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Operating schedule not found",
      });
    }

    // Check if schedule is marked as a holiday
    if (schedule.isHoliday) {
      return res.status(400).json({
        success: false,
        message: "Cannot create time slots for days marked as holidays",
      });
    }

    // Validate each time slot
    for (const slot of timeSlots) {
      if (!slot.startTime || !slot.endTime) {
        return res.status(400).json({
          success: false,
          message: "Each time slot must have startTime and endTime",
        });
      }

      const startDate = new Date(slot.startTime);
      const endDate = new Date(slot.endTime);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid time format. Please use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)",
        });
      }

      if (startDate >= endDate) {
        return res.status(400).json({
          success: false,
          message: "End time must be after start time",
        });
      }

      // NEW CHECK: Ensure time slot is on the same date as the operating schedule
      if (
        !isOnSameDate(startDate, schedule.date) ||
        !isOnSameDate(endDate, schedule.date)
      ) {
        return res.status(400).json({
          success: false,
          message: `Time slot (${startDate.toISOString()} - ${endDate.toISOString()}) must be on the same date as the operating schedule (${schedule.date.toISOString().split("T")[0]})`,
        });
      }

      // Check for overlaps with existing time slots
      const existingTimeSlot = await getExistingTimeSlot(
        operatingScheduleId,
        startDate,
        endDate,
      );
      if (existingTimeSlot) {
        return res.status(400).json({
          success: false,
          message: `Time slot (${startDate.toISOString()} - ${endDate.toISOString()}) overlaps with an existing time slot`,
        });
      }

      // Check for overlaps with other slots in the request
      for (const otherSlot of timeSlots) {
        if (slot === otherSlot) continue; // Skip comparison with self

        const otherStartDate = new Date(otherSlot.startTime);
        const otherEndDate = new Date(otherSlot.endTime);

        // Check if slots overlap
        if (
          (startDate <= otherEndDate && endDate >= otherStartDate) ||
          (otherStartDate <= endDate && otherEndDate >= startDate)
        ) {
          return res.status(400).json({
            success: false,
            message: "Time slots in the request overlap with each other",
          });
        }
      }
    }

    // Create the time slots
    const createdTimeSlots = await createMultipleTimeSlots(
      operatingScheduleId,
      timeSlots,
    );

    res.status(201).json({
      success: true,
      message: `${createdTimeSlots.length} time slots created successfully`,
      data: createdTimeSlots,
    });
  } catch (error) {
    console.error("[CREATE MULTIPLE TIME SLOTS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create time slots",
    });
  }
};

// Add other controller functions without changes
const getAllTimeSlotsHandler = async (req, res) => {
  try {
    const { operatingScheduleId, date, startTime, endTime } = req.query;

    // Get all time slots with optional filters
    const timeSlots = await getAllTimeSlots({
      operatingScheduleId,
      date,
      startTime,
      endTime,
    });

    res.status(200).json({
      success: true,
      count: timeSlots.length,
      data: timeSlots,
    });
  } catch (error) {
    console.error("[GET ALL TIME SLOTS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch time slots",
    });
  }
};

const getTimeSlotByIdHandler = async (req, res) => {
  try {
    const { id } = req.params;

    // Get time slot by ID
    const timeSlot = await getTimeSlotById(id);

    if (!timeSlot) {
      return res.status(404).json({
        success: false,
        message: "Time slot not found",
      });
    }

    res.status(200).json({
      success: true,
      data: timeSlot,
    });
  } catch (error) {
    console.error("[GET TIME SLOT BY ID ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch time slot",
    });
  }
};

const getTimeSlotsByScheduleIdHandler = async (req, res) => {
  try {
    const { scheduleId } = req.params;

    // Check if operating schedule exists
    const schedule = await getOperatingScheduleById(scheduleId);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Operating schedule not found",
      });
    }

    // Get time slots by schedule ID
    const timeSlots = await getTimeSlotsByScheduleId(scheduleId);

    res.status(200).json({
      success: true,
      count: timeSlots.length,
      data: timeSlots,
    });
  } catch (error) {
    console.error("[GET TIME SLOTS BY SCHEDULE ID ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch time slots",
    });
  }
};

const deleteTimeSlotHandler = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if time slot exists
    const timeSlot = await getTimeSlotById(id);
    if (!timeSlot) {
      return res.status(404).json({
        success: false,
        message: "Time slot not found",
      });
    }

    // Check if there are any sessions with reservations
    const hasBookedSessions = timeSlot.sessions.some(
      (session) => session.isBooked || session.reservation !== null,
    );

    if (hasBookedSessions) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete time slot with booked sessions",
      });
    }

    // Delete time slot
    await deleteTimeSlot(id);

    res.status(200).json({
      success: true,
      message: "Time slot deleted successfully",
    });
  } catch (error) {
    // Handle foreign key constraint error
    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete time slot with associated sessions",
      });
    }

    console.error("[DELETE TIME SLOT ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete time slot",
    });
  }
};

const getAvailableTimeSlotsHandler = async (req, res) => {
  try {
    const { date } = req.params;

    // Validate date
    if (!date || isNaN(new Date(date).getTime())) {
      return res.status(400).json({
        success: false,
        message: "Valid date is required (YYYY-MM-DD)",
      });
    }

    // Get available time slots
    const availableTimeSlots = await getAvailableTimeSlots(date);

    res.status(200).json({
      success: true,
      count: availableTimeSlots.length,
      data: availableTimeSlots,
    });
  } catch (error) {
    console.error("[GET AVAILABLE TIME SLOTS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch available time slots",
    });
  }
};

export default {
  createNewTimeSlot,
  getAllTimeSlotsHandler,
  getTimeSlotByIdHandler,
  getTimeSlotsByScheduleIdHandler,
  updateTimeSlotHandler,
  deleteTimeSlotHandler,
  getAvailableTimeSlotsHandler,
  createMultipleTimeSlotsHandler,
};
