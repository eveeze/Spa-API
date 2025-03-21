// src/controllers/serviceCategoryController.js
import * as serviceCategoryRepository from "../repository/serviceCategoryRepository.js";

export const getAllCategories = async (req, res, next) => {
  try {
    const categories = await serviceCategoryRepository.findAll();

    return res.status(200).json({
      success: true,
      message: "Service categories retrieved successfully",
      data: categories,
    });
  } catch (error) {
    next(error);
  }
};

export const getCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await serviceCategoryRepository.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Service category not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service category retrieved successfully",
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const newCategory = await serviceCategoryRepository.create({
      name,
      description,
    });

    return res.status(201).json({
      success: true,
      message: "Service category created successfully",
      data: newCategory,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // Check if category exists
    const category = await serviceCategoryRepository.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Service category not found",
      });
    }

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const updatedCategory = await serviceCategoryRepository.update(id, {
      name,
      description,
    });

    return res.status(200).json({
      success: true,
      message: "Service category updated successfully",
      data: updatedCategory,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const category = await serviceCategoryRepository.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Service category not found",
      });
    }

    // Check if category has services
    if (category.services && category.services.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete category with associated services",
      });
    }

    await serviceCategoryRepository.remove(id);

    return res.status(200).json({
      success: true,
      message: "Service category deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
