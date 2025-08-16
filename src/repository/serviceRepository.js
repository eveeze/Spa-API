// src/repositories/serviceRepository.js
import prisma from "../config/db.js";

/**
 * Creates a new service in the database
 * @param {Object} serviceData - The service data to be created
 * @returns {Promise<Object>} The created service
 */
export const createService = async (serviceData) => {
  // Extract price tiers data if present
  const { priceTiers, ...serviceDetails } = serviceData;

  // Create service with transaction to handle price tiers
  return await prisma.$transaction(async (tx) => {
    // Create the service first
    const service = await tx.service.create({
      data: serviceDetails,
      include: {
        category: true,
      },
    });

    // If price tiers provided, create them
    if (priceTiers && priceTiers.length > 0) {
      await Promise.all(
        priceTiers.map((tier) =>
          tx.priceTier.create({
            data: {
              ...tier,
              serviceId: service.id,
            },
          })
        )
      );
    }

    // Return the created service with its price tiers
    return await tx.service.findUnique({
      where: { id: service.id },
      include: {
        category: true,
        priceTiers: true,
      },
    });
  });
};

/**
 * Gets all services with optional filtering
 * @param {Object} options - Filter options
 * @param {Boolean} options.isActive - Filter by active status
 * @param {String} options.categoryId - Filter by category ID
 * @param {Number} options.babyAge - Filter by baby age in months to find suitable services
 * @returns {Promise<Array>} List of services matching criteria
 */
export const getAllServices = async (options = {}) => {
  const { isActive, categoryId, babyAge } = options;

  // Build filter conditions based on provided options
  const where = {};

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  // Build the query to filter services based on baby age compatibility
  let serviceQuery = {
    where,
    include: {
      category: true,
      priceTiers: true,
    },
    orderBy: {
      name: "asc",
    },
  };

  // Get all services first
  let services = await prisma.service.findMany(serviceQuery);

  // If babyAge is provided, filter services based on baby age compatibility
  if (babyAge !== undefined) {
    const babyAgeNumber = parseInt(babyAge);

    services = services.filter((service) => {
      // For services with price tiers, check if any tier matches the baby age
      if (service.hasPriceTiers && service.priceTiers.length > 0) {
        return service.priceTiers.some(
          (tier) =>
            babyAgeNumber >= tier.minBabyAge && babyAgeNumber <= tier.maxBabyAge
        );
      }
      // For services without price tiers, check if baby age is within the service's range
      else {
        return (
          service.minBabyAge <= babyAgeNumber &&
          service.maxBabyAge >= babyAgeNumber
        );
      }
    });
  }

  return services;
};

/**
 * Gets a service by its ID
 * @param {String} id - The service ID
 * @returns {Promise<Object|null>} The service or null if not found
 */
export const getServiceById = async (id) => {
  return await prisma.service.findUnique({
    where: { id },
    include: {
      category: true,
      priceTiers: {
        orderBy: {
          minBabyAge: "asc",
        },
      },
      // 1. Ambil relasi 'reservations' yang benar-benar ada di model Service
      reservations: {
        // 2. Filter agar hanya mengambil reservasi yang SUDAH memiliki rating
        where: {
          rating: {
            isNot: null,
          },
        },
        // 3. Pilih data yang Anda perlukan dari setiap reservasi
        select: {
          rating: true, // Ambil detail rating dari reservasi
          customer: {
            // Ambil detail customer dari reservasi
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc", // Urutkan reservasi berdasarkan tanggal dibuat
        },
      },
    },
  });
};

/**
 * Updates a service by its ID
 * @param {String} id - The service ID
 * @param {Object} updateData - The data to update
 * @returns {Promise<Object>} The updated service
 */
export const updateService = async (id, updateData) => {
  // Extract price tiers data if present
  const { priceTiers, ...serviceDetails } = updateData;

  // Update service with transaction to handle price tiers
  return await prisma.$transaction(async (tx) => {
    // Update the service first
    const service = await tx.service.update({
      where: { id },
      data: serviceDetails,
    });

    // If price tiers provided, update them
    if (priceTiers) {
      // Delete existing price tiers if we're updating them
      await tx.priceTier.deleteMany({
        where: { serviceId: id },
      });

      // Create new price tiers
      if (priceTiers.length > 0) {
        await Promise.all(
          priceTiers.map((tier) =>
            tx.priceTier.create({
              data: {
                ...tier,
                serviceId: service.id,
              },
            })
          )
        );
      }
    }

    // Return the updated service with its price tiers
    return await tx.service.findUnique({
      where: { id: service.id },
      include: {
        category: true,
        priceTiers: true,
      },
    });
  });
};

/**
 * Updates service rating average
 * @param {String} serviceId - The service ID
 * @returns {Promise<Object>} The updated service
 */
export const updateServiceRating = async (serviceId) => {
  // Calculate average rating from all ratings for this service
  const ratingsAgg = await prisma.rating.aggregate({
    where: {
      serviceId: serviceId,
    },
    _avg: {
      rating: true,
    },
  });

  // Update the service with the new average rating
  return await prisma.service.update({
    where: { id: serviceId },
    data: {
      averageRating: ratingsAgg._avg.rating || 0,
    },
  });
};

/**
 * Deletes a service by its ID
 * @param {String} id - The service ID
 * @returns {Promise<Object>} The deleted service
 */
export const deleteService = async (id) => {
  // Price tiers will be automatically deleted due to cascade delete
  return await prisma.service.delete({
    where: { id },
  });
};

/**
 * Gets services by category ID
 * @param {String} categoryId - The category ID
 * @param {Number} babyAge - Optional baby age to filter by
 * @returns {Promise<Array>} List of services in the category
 */
export const getServicesByCategory = async (categoryId, babyAge) => {
  // Get all services in the category
  let services = await prisma.service.findMany({
    where: {
      categoryId: categoryId,
      isActive: true,
    },
    include: {
      category: true,
      priceTiers: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  // If babyAge is provided, filter services based on baby age compatibility
  if (babyAge !== undefined) {
    const babyAgeNumber = parseInt(babyAge);

    services = services.filter((service) => {
      // For services with price tiers, check if any tier matches the baby age
      if (service.hasPriceTiers && service.priceTiers.length > 0) {
        return service.priceTiers.some(
          (tier) =>
            babyAgeNumber >= tier.minBabyAge && babyAgeNumber <= tier.maxBabyAge
        );
      }
      // For services without price tiers, check if baby age is within the service's range
      else {
        return (
          service.minBabyAge <= babyAgeNumber &&
          service.maxBabyAge >= babyAgeNumber
        );
      }
    });
  }

  return services;
};

/**
 * Toggles service active status
 * @param {String} id - The service ID
 * @param {Boolean} isActive - The active status to set
 * @returns {Promise<Object>} The updated service
 */
export const toggleServiceStatus = async (id, isActive) => {
  return await prisma.service.update({
    where: { id },
    data: { isActive },
    include: {
      priceTiers: true,
    },
  });
};

/**
 * Gets price tier by ID
 * @param {String} id - The price tier ID
 * @returns {Promise<Object|null>} The price tier or null if not found
 */
export const getPriceTierById = async (id) => {
  return await prisma.priceTier.findUnique({
    where: { id },
    include: {
      service: true,
    },
  });
};

/**
 * Gets the appropriate price tier for a service based on baby age
 * @param {String} serviceId - The service ID
 * @param {Number} babyAge - The baby's age in months
 * @returns {Promise<Object|null>} The matching price tier or null if no match
 */
export const getServicePriceTierByAge = async (serviceId, babyAge) => {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: {
      priceTiers: true,
    },
  });

  if (!service) {
    return null;
  }

  // If service doesn't use price tiers, return null
  if (!service.hasPriceTiers) {
    return null;
  }

  // Find the appropriate price tier for the baby's age
  return (
    service.priceTiers.find(
      (tier) => babyAge >= tier.minBabyAge && babyAge <= tier.maxBabyAge
    ) || null
  );
};
