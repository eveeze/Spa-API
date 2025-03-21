// src/controllers/serviceController.js
import {
  createService,
  getAllServices,
  getServiceById,
  updateService,
  deleteService,
  getServicesByCategory,
  toggleServiceStatus,
  getServicePriceTierByAge,
} from "../repository/serviceRepository.js";

/**
 * Creates a new service
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createServiceHandler = async (req, res) => {
  try {
    const {
      name,
      description,
      duration,
      categoryId,
      hasPriceTiers,
      price,
      minBabyAge,
      maxBabyAge,
      priceTiers,
    } = req.body;

    // Validate required fields
    if (!name || !description || !duration || !categoryId) {
      // If an image was uploaded but validation failed, we should delete it
      if (req.serviceImageUrl && req.file && req.file.public_id) {
        await deleteImage(req.file.public_id);
      }

      return res.status(400).json({
        success: false,
        message: "Name, description, duration, and categoryId are required",
      });
    }

    // Validate based on whether service has price tiers or not
    const hasPriceTiersBoolean =
      hasPriceTiers === true || hasPriceTiers === "true";

    if (hasPriceTiersBoolean) {
      // Validate price tiers
      if (
        !priceTiers ||
        !Array.isArray(priceTiers) ||
        priceTiers.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Price tiers are required when hasPriceTiers is true",
        });
      }

      // Validate each price tier
      for (const tier of priceTiers) {
        if (
          !tier.tierName ||
          tier.minBabyAge === undefined ||
          tier.maxBabyAge === undefined ||
          tier.price === undefined
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Each price tier must have tierName, minBabyAge, maxBabyAge, and price",
          });
        }
      }
    } else {
      // Validate required fields for services without price tiers
      if (
        price === undefined ||
        minBabyAge === undefined ||
        maxBabyAge === undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Price, minBabyAge, and maxBabyAge are required when hasPriceTiers is false",
        });
      }
    }

    // Prepare service data
    const serviceData = {
      name,
      description,
      duration: parseInt(duration),
      categoryId,
      hasPriceTiers: hasPriceTiersBoolean,
      imageUrl: req.serviceImageUrl || null,
    };

    // Add fields based on pricing model
    if (hasPriceTiersBoolean) {
      // Parse and add price tiers
      serviceData.priceTiers = priceTiers.map((tier) => ({
        tierName: tier.tierName,
        minBabyAge: parseInt(tier.minBabyAge),
        maxBabyAge: parseInt(tier.maxBabyAge),
        price: parseFloat(tier.price),
      }));
    } else {
      // Add single price and age range
      serviceData.price = parseFloat(price);
      serviceData.minBabyAge = parseInt(minBabyAge);
      serviceData.maxBabyAge = parseInt(maxBabyAge);
    }

    const service = await createService(serviceData);

    res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: service,
    });
  } catch (error) {
    // If an error occurred and an image was uploaded, we should clean it up
    if (req.serviceImageUrl && req.file && req.file.public_id) {
      try {
        await deleteImage(req.file.public_id);
      } catch (deleteError) {
        console.error("[DELETE IMAGE ERROR]:", deleteError);
      }
    }

    console.error("[CREATE SERVICE ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create service",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Gets all services with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getAllServicesHandler = async (req, res) => {
  try {
    const { isActive, categoryId, babyAge } = req.query;

    // Parse query parameters
    const options = {
      isActive:
        isActive === "true" ? true : isActive === "false" ? false : undefined,
      categoryId: categoryId || undefined,
      babyAge: babyAge ? parseInt(babyAge) : undefined,
    };

    const services = await getAllServices(options);

    res.status(200).json({
      success: true,
      message: "Services retrieved successfully",
      count: services.length,
      data: services,
    });
  } catch (error) {
    console.error("[GET ALL SERVICES ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve services",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Gets a service by its ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getServiceByIdHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await getServiceById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Service retrieved successfully",
      data: service,
    });
  } catch (error) {
    console.error("[GET SERVICE BY ID ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve service",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Updates a service
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateServiceHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      duration,
      categoryId,
      hasPriceTiers,
      price,
      minBabyAge,
      maxBabyAge,
      priceTiers,
      isActive,
    } = req.body;

    // Check if service exists
    const existingService = await getServiceById(id);
    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    // Prepare update data
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (duration !== undefined) updateData.duration = parseInt(duration);
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (isActive !== undefined)
      updateData.isActive = isActive === true || isActive === "true";

    // Add service image URL if uploaded
    if (req.serviceImageUrl) {
      updateData.imageUrl = req.serviceImageUrl;
    }

    // Handle pricing model changes
    if (hasPriceTiers !== undefined) {
      const hasPriceTiersBoolean =
        hasPriceTiers === true || hasPriceTiers === "true";
      updateData.hasPriceTiers = hasPriceTiersBoolean;

      if (hasPriceTiersBoolean) {
        // Validate price tiers if updating to use price tiers
        if (
          !priceTiers ||
          !Array.isArray(priceTiers) ||
          priceTiers.length === 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Price tiers are required when hasPriceTiers is true",
          });
        }

        // Parse and add price tiers
        updateData.priceTiers = priceTiers.map((tier) => ({
          tierName: tier.tierName,
          minBabyAge: parseInt(tier.minBabyAge),
          maxBabyAge: parseInt(tier.maxBabyAge),
          price: parseFloat(tier.price),
        }));

        // Remove single price and age range if switching to price tiers
        updateData.price = null;
        updateData.minBabyAge = null;
        updateData.maxBabyAge = null;
      } else {
        // Validate required fields for services without price tiers
        if (
          price === undefined ||
          minBabyAge === undefined ||
          maxBabyAge === undefined
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Price, minBabyAge, and maxBabyAge are required when hasPriceTiers is false",
          });
        }

        // Add single price and age range
        updateData.price = parseFloat(price);
        updateData.minBabyAge = parseInt(minBabyAge);
        updateData.maxBabyAge = parseInt(maxBabyAge);

        // Empty price tiers if switching from price tiers
        updateData.priceTiers = [];
      }
    } else {
      // Update fields based on existing pricing model
      if (existingService.hasPriceTiers) {
        // Update price tiers if provided
        if (priceTiers) {
          updateData.priceTiers = priceTiers.map((tier) => ({
            tierName: tier.tierName,
            minBabyAge: parseInt(tier.minBabyAge),
            maxBabyAge: parseInt(tier.maxBabyAge),
            price: parseFloat(tier.price),
          }));
        }
      } else {
        // Update single price and age range
        if (price !== undefined) updateData.price = parseFloat(price);
        if (minBabyAge !== undefined)
          updateData.minBabyAge = parseInt(minBabyAge);
        if (maxBabyAge !== undefined)
          updateData.maxBabyAge = parseInt(maxBabyAge);
      }
    }

    const updatedService = await updateService(id, updateData);

    res.status(200).json({
      success: true,
      message: "Service updated successfully",
      data: updatedService,
    });
  } catch (error) {
    console.error("[UPDATE SERVICE ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update service",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Deletes a service
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const deleteServiceHandler = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if service exists
    const existingService = await getServiceById(id);
    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    await deleteService(id);

    res.status(200).json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    console.error("[DELETE SERVICE ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete service",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Gets services by category
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getServicesByCategoryHandler = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { babyAge } = req.query;

    const babyAgeParam = babyAge ? parseInt(babyAge) : undefined;
    const services = await getServicesByCategory(categoryId, babyAgeParam);

    res.status(200).json({
      success: true,
      message: "Services retrieved successfully",
      count: services.length,
      data: services,
    });
  } catch (error) {
    console.error("[GET SERVICES BY CATEGORY ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve services",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Toggles service active status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const toggleServiceStatusHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: "isActive field is required",
      });
    }

    // Check if service exists
    const existingService = await getServiceById(id);
    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    const updatedService = await toggleServiceStatus(
      id,
      isActive === true || isActive === "true"
    );

    res.status(200).json({
      success: true,
      message: `Service ${
        updatedService.isActive ? "activated" : "deactivated"
      } successfully`,
      data: updatedService,
    });
  } catch (error) {
    console.error("[TOGGLE SERVICE STATUS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update service status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Gets a price tier based on service ID and baby age
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getServicePriceTierHandler = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { babyAge } = req.query;

    if (!babyAge) {
      return res.status(400).json({
        success: false,
        message: "Baby age is required",
      });
    }

    const service = await getServiceById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    const babyAgeNum = parseInt(babyAge);

    // Different logic based on whether service has price tiers
    if (service.hasPriceTiers) {
      const priceTier = await getServicePriceTierByAge(serviceId, babyAgeNum);

      if (!priceTier) {
        return res.status(404).json({
          success: false,
          message: "No price tier found for the given baby age",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Price tier found successfully",
        data: priceTier,
      });
    } else {
      // For services without price tiers, check if baby age is in range
      if (babyAgeNum < service.minBabyAge || babyAgeNum > service.maxBabyAge) {
        return res.status(404).json({
          success: false,
          message: "Baby age is outside the available range for this service",
        });
      }

      // Return the service with its price
      return res.status(200).json({
        success: true,
        message: "Service price found successfully",
        data: {
          serviceId: service.id,
          price: service.price,
          minBabyAge: service.minBabyAge,
          maxBabyAge: service.maxBabyAge,
        },
      });
    }
  } catch (error) {
    console.error("[GET SERVICE PRICE TIER ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve price information",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
