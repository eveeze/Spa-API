// src/routes/serviceCategoryRoutes.js
import express from "express";
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controller/serviceCategoryController.js";
import { ownerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public routes
router.get("/", getAllCategories);
router.get("/:id", getCategoryById);

// Protected routes (Owner only)
router.post("/", ownerAuth, createCategory);
router.put("/:id", ownerAuth, updateCategory);
router.delete("/:id", ownerAuth, deleteCategory);

export default router;
