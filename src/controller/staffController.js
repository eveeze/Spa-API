// src/controllers/staffController.js
import {
  createStaff,
  getAllStaff,
  getStaffById,
  updateStaff,
  deleteStaff,
  toggleStaffActiveStatus,
} from "../repository/staffRepository.js";
import { deleteImage } from "../utils/cloudinary.js";

/**
 * Create a new staff member
 */
const createNewStaff = async (req, res) => {
  try {
    const { name, email, phoneNumber, address, specialization } = req.body;

    // Validate required fields
    if (!name || !email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Name, email and phone number are required",
      });
    }

    // Add profile picture if uploaded
    let staffData = {
      name,
      email,
      phoneNumber,
      address,
      specialization,
    };

    if (req.file) {
      staffData.profilePicture = req.file.path;
    }

    // Create staff in database
    const newStaff = await createStaff(staffData);

    res.status(201).json({
      success: true,
      message: "Staff created successfully",
      data: newStaff,
    });
  } catch (error) {
    // Handle unique constraint error
    if (error.code === "P2002") {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    console.error("[CREATE STAFF ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create staff",
    });
  }
};

/**
 * Get all staff members
 */
const getAllStaffMembers = async (req, res) => {
  try {
    // Get query parameters
    const isActive =
      req.query.isActive === "true"
        ? true
        : req.query.isActive === "false"
        ? false
        : undefined;

    // Get all staff with optional filters
    const staff = await getAllStaff({ isActive });

    res.status(200).json({
      success: true,
      count: staff.length,
      data: staff,
    });
  } catch (error) {
    console.error("[GET ALL STAFF ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch staff",
    });
  }
};

/**
 * Get staff member by ID
 */
const getStaffMemberById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get staff by ID
    const staff = await getStaffById(id);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    res.status(200).json({
      success: true,
      data: staff,
    });
  } catch (error) {
    console.error("[GET STAFF BY ID ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch staff",
    });
  }
};

/**
 * Update staff member by ID
 */
const updateStaffMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phoneNumber, address, specialization, isActive } =
      req.body;

    // Check if staff exists
    const existingStaff = await getStaffById(id);
    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (address !== undefined) updateData.address = address; // Allow empty string
    if (specialization !== undefined)
      updateData.specialization = specialization; // Allow empty string
    if (isActive !== undefined)
      updateData.isActive = isActive === "true" || isActive === true;

    // Handle profile picture update
    if (req.file) {
      // Delete old image from Cloudinary if exists
      if (existingStaff.profilePicture) {
        await deleteImage(existingStaff.profilePicture);
      }
      updateData.profilePicture = req.file.path;
    }

    // Update staff
    const updatedStaff = await updateStaff(id, updateData);

    res.status(200).json({
      success: true,
      message: "Staff updated successfully",
      data: updatedStaff,
    });
  } catch (error) {
    // Handle unique constraint error
    if (error.code === "P2002") {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    console.error("[UPDATE STAFF ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update staff",
    });
  }
};

/**
 * Delete staff member by ID
 */
const deleteStaffMember = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if staff exists
    const existingStaff = await getStaffById(id);
    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    // Delete profile picture from Cloudinary if exists
    if (existingStaff.profilePicture) {
      await deleteImage(existingStaff.profilePicture);
    }

    // Delete staff
    await deleteStaff(id);

    res.status(200).json({
      success: true,
      message: "Staff deleted successfully",
    });
  } catch (error) {
    // Handle foreign key constraint error
    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete staff with associated sessions or reservations",
      });
    }

    console.error("[DELETE STAFF ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete staff",
    });
  }
};

/**
 * Toggle staff active status
 */
const toggleActiveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: "isActive field is required",
      });
    }

    // Check if staff exists
    const existingStaff = await getStaffById(id);
    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    // Convert to boolean
    const activeStatus = isActive === "true" || isActive === true;

    // Toggle status
    const updatedStaff = await toggleStaffActiveStatus(id, activeStatus);

    res.status(200).json({
      success: true,
      message: `Staff ${
        activeStatus ? "activated" : "deactivated"
      } successfully`,
      data: updatedStaff,
    });
  } catch (error) {
    console.error("[TOGGLE STAFF STATUS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update staff status",
    });
  }
};

export default {
  createNewStaff,
  getAllStaffMembers,
  getStaffMemberById,
  updateStaffMember,
  deleteStaffMember,
  toggleActiveStatus,
};
