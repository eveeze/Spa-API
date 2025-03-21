// src/routes/staffRoutes.js
import express from "express";
import staffController from "../controller/staffController.js";
import { ownerAuth } from "../middlewares/authMiddleware.js";
import { uploadStaffProfile } from "../utils/cloudinary.js";

const router = express.Router();

/**
 * @route   POST /api/staff
 * @desc    Create a new staff member
 * @access  Private (Owner)
 * @body    name, email, phoneNumber, address, specialization
 * @file    profilePicture
 */
router.post(
  "/",
  ownerAuth,
  uploadStaffProfile.single("profilePicture"),
  staffController.createNewStaff
);

/**
 * @route   GET /api/staff
 * @desc    Get all staff members
 * @access  Public (Customer)
 * @query   isActive
 */
router.get("/", staffController.getAllStaffMembers);

/**
 * @route   GET /api/staff/:id
 * @desc    Get staff member by ID
 * @access  Public (Customer)
 * @param   id
 */
router.get("/:id", staffController.getStaffMemberById);

/**
 * @route   PUT /api/staff/:id
 * @desc    Update staff member by ID
 * @access  Private (Owner)
 * @param   id
 * @body    name, email, phoneNumber, address, specialization, isActive
 * @file    profilePicture
 */
router.put(
  "/:id",
  ownerAuth,
  uploadStaffProfile.single("profilePicture"),
  staffController.updateStaffMember
);

/**
 * @route   DELETE /api/staff/:id
 * @desc    Delete staff member by ID
 * @access  Private (Owner)
 * @param   id
 */
router.delete("/:id", ownerAuth, staffController.deleteStaffMember);

/**
 * @route   PATCH /api/staff/:id/status
 * @desc    Toggle staff active status
 * @access  Private (Owner)
 * @param   id
 * @body    isActive
 */
router.patch("/:id/status", ownerAuth, staffController.toggleActiveStatus);

export default router;
