// src/routes/serviceRoutes.js
import express from "express";
import {
  createServiceHandler,
  getAllServicesHandler,
  getServiceByIdHandler,
  updateServiceHandler,
  deleteServiceHandler,
  getServicesByCategoryHandler,
  toggleServiceStatusHandler,
  getServicePriceTierHandler,
} from "../controller/serviceController.js";
import { ownerAuth } from "../middlewares/authMiddleware.js";
import { serviceImageUploadMiddleware } from "../middlewares/imageUploadMiddleware.js";

const router = express.Router();

/**
 * @route POST /api/services
 * @desc Create a new service (owner only)
 * @access Private (Owner)
 */
router.post("/", ownerAuth, serviceImageUploadMiddleware, createServiceHandler);

/**
 * @route GET /api/services
 * @desc Get all services (with optional filtering)
 * @access Public
 */
router.get("/", getAllServicesHandler);

/**
 * @route GET /api/services/:id
 * @desc Get a service by ID
 * @access Public
 */
router.get("/:id", getServiceByIdHandler);

/**
 * @route PUT /api/services/:id
 * @desc Update a service by ID (owner only)
 * @access Private (Owner)
 */
router.put(
  "/:id",
  ownerAuth,
  serviceImageUploadMiddleware,
  updateServiceHandler
);

/**
 * @route DELETE /api/services/:id
 * @desc Delete a service by ID (owner only)
 * @access Private (Owner)
 */
router.delete("/:id", ownerAuth, deleteServiceHandler);

/**
 * @route GET /api/services/category/:categoryId
 * @desc Get services by category ID
 * @access Public
 */
router.get("/category/:categoryId", getServicesByCategoryHandler);

/**
 * @route PATCH /api/services/:id/status
 * @desc Toggle service active status (owner only)
 * @access Private (Owner)
 */
router.patch("/:id/status", ownerAuth, toggleServiceStatusHandler);

/**
 * @route GET /api/services/:serviceId/price
 * @desc Get appropriate price tier based on baby age
 * @access Public
 */
router.get("/:serviceId/price", getServicePriceTierHandler);

export default router;
