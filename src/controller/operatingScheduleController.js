// src/controller/operatingScheduleController.js
import {
  createOperatingSchedule,
  getAllOperatingSchedules,
  getOperatingScheduleById,
  getOperatingScheduleByDate,
  updateOperatingSchedule,
  deleteOperatingSchedule,
  toggleHolidayStatus,
} from "../repository/operatingScheduleRepository.js";

/**
 * Create a new operating schedule
 */
const createNewOperatingSchedule = async (req, res) => {
  try {
    const { date, isHoliday, notes } = req.body;

    // Validate required fields
    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required",
      });
    }

    // Check if a schedule already exists for this date
    const existingSchedule = await getOperatingScheduleByDate(date);
    if (existingSchedule) {
      return res.status(400).json({
        success: false,
        message: "An operating schedule already exists for this date",
      });
    }

    // Prepare schedule data
    const scheduleData = {
      date: new Date(date),
      isHoliday: isHoliday === true || isHoliday === "true",
      notes,
    };

    // Create operating schedule in database
    const newSchedule = await createOperatingSchedule(scheduleData);

    res.status(201).json({
      success: true,
      message: "Operating schedule created successfully",
      data: newSchedule,
    });
  } catch (error) {
    console.error("[CREATE OPERATING SCHEDULE ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create operating schedule",
    });
  }
};

/**
 * Get all operating schedules
 */
const getAllSchedules = async (req, res) => {
  try {
    // Get query parameters
    const { date, isHoliday, startDate, endDate } = req.query;

    // Get all schedules with optional filters
    const schedules = await getAllOperatingSchedules({
      date,
      isHoliday,
      startDate,
      endDate,
    });

    res.status(200).json({
      success: true,
      count: schedules.length,
      data: schedules,
    });
  } catch (error) {
    console.error("[GET ALL OPERATING SCHEDULES ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch operating schedules",
    });
  }
};

/**
 * Get operating schedule by ID
 */
const getScheduleById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get schedule by ID
    const schedule = await getOperatingScheduleById(id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Operating schedule not found",
      });
    }

    res.status(200).json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    console.error("[GET OPERATING SCHEDULE BY ID ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch operating schedule",
    });
  }
};

/**
 * Get operating schedule by date
 */
const getScheduleByDate = async (req, res) => {
  try {
    const { date } = req.params;

    // Validate date format
    if (!date || isNaN(new Date(date).getTime())) {
      return res.status(400).json({
        success: false,
        message: "Valid date is required (YYYY-MM-DD)",
      });
    }

    // Get schedule by date
    const schedule = await getOperatingScheduleByDate(date);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Operating schedule not found for this date",
      });
    }

    res.status(200).json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    console.error("[GET OPERATING SCHEDULE BY DATE ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch operating schedule",
    });
  }
};

/**
 * Update operating schedule by ID
 */
const updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, isHoliday, notes } = req.body;

    // Check if schedule exists
    const existingSchedule = await getOperatingScheduleById(id);
    if (!existingSchedule) {
      return res.status(404).json({
        success: false,
        message: "Operating schedule not found",
      });
    }

    // Prepare update data
    const updateData = {};
    if (date) {
      // Check if the new date already exists for another schedule
      if (
        new Date(date).toISOString() !==
        new Date(existingSchedule.date).toISOString()
      ) {
        const scheduleWithDate = await getOperatingScheduleByDate(date);
        if (scheduleWithDate && scheduleWithDate.id !== id) {
          return res.status(400).json({
            success: false,
            message: "An operating schedule already exists for this date",
          });
        }
        updateData.date = new Date(date);
      }
    }

    if (isHoliday !== undefined)
      updateData.isHoliday = isHoliday === true || isHoliday === "true";
    if (notes !== undefined) updateData.notes = notes;

    // Update schedule
    const updatedSchedule = await updateOperatingSchedule(id, updateData);

    res.status(200).json({
      success: true,
      message: "Operating schedule updated successfully",
      data: updatedSchedule,
    });
  } catch (error) {
    console.error("[UPDATE OPERATING SCHEDULE ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update operating schedule",
    });
  }
};

/**
 * Delete operating schedule by ID
 */
const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if schedule exists
    const existingSchedule = await getOperatingScheduleById(id);
    if (!existingSchedule) {
      return res.status(404).json({
        success: false,
        message: "Operating schedule not found",
      });
    }

    // Check if there are any reservations associated with this schedule's time slots
    const hasReservations = existingSchedule.timeSlots.some((timeSlot) =>
      timeSlot.sessions.some((session) => session.reservation !== null),
    );

    if (hasReservations) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete schedule with associated reservations",
      });
    }

    // Delete schedule
    await deleteOperatingSchedule(id);

    res.status(200).json({
      success: true,
      message: "Operating schedule deleted successfully",
    });
  } catch (error) {
    // Handle foreign key constraint error
    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete operating schedule with associated time slots or sessions",
      });
    }

    console.error("[DELETE OPERATING SCHEDULE ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete operating schedule",
    });
  }
};

/**
 * Toggle holiday status
 */
const toggleHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { isHoliday } = req.body;

    if (isHoliday === undefined) {
      return res.status(400).json({
        success: false,
        message: "isHoliday field is required",
      });
    }

    // Check if schedule exists
    const existingSchedule = await getOperatingScheduleById(id);
    if (!existingSchedule) {
      return res.status(404).json({
        success: false,
        message: "Operating schedule not found",
      });
    }

    // Convert to boolean
    const holidayStatus = isHoliday === "true" || isHoliday === true;

    // Toggle status
    const updatedSchedule = await toggleHolidayStatus(id, holidayStatus);

    res.status(200).json({
      success: true,
      message: `Operating schedule marked as ${
        holidayStatus ? "holiday" : "working day"
      } successfully`,
      data: updatedSchedule,
    });
  } catch (error) {
    console.error("[TOGGLE HOLIDAY STATUS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update holiday status",
    });
  }
};

export default {
  createNewOperatingSchedule,
  getAllSchedules,
  getScheduleById,
  getScheduleByDate,
  updateSchedule,
  deleteSchedule,
  toggleHoliday,
};
