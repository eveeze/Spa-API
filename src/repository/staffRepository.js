// src/repository/staffRepository.js
import prisma from "../config/db.js";

/**
 * Create a new staff member
 * @param {Object} staffData - Staff data to create
 * @returns {Promise<Object>} Created staff
 */
export const createStaff = async (staffData) => {
  return await prisma.staff.create({
    data: staffData,
  });
};

/**
 * Get all staff members
 * @param {Object} options - Query options
 * @returns {Promise<Array>} List of staff members
 */
export const getAllStaff = async (options = {}) => {
  const { isActive } = options;

  const queryOptions = {
    where: {},
    orderBy: {
      createdAt: "desc",
    },
  };

  // Filter by active status if specified
  if (isActive !== undefined) {
    queryOptions.where.isActive = isActive;
  }

  return await prisma.staff.findMany(queryOptions);
};

/**
 * Get staff member by ID
 * @param {String} id - Staff ID
 * @returns {Promise<Object|null>} Staff member or null if not found
 */
export const getStaffById = async (id) => {
  return await prisma.staff.findUnique({
    where: { id },
    include: {
      sessions: {
        take: 10,
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });
};

/**
 * Update staff member by ID
 * @param {String} id - Staff ID
 * @param {Object} staffData - Updated staff data
 * @returns {Promise<Object>} Updated staff
 */
export const updateStaff = async (id, staffData) => {
  return await prisma.staff.update({
    where: { id },
    data: staffData,
  });
};

/**
 * Delete staff member by ID
 * @param {String} id - Staff ID
 * @returns {Promise<Object>} Deleted staff
 */
export const deleteStaff = async (id) => {
  return await prisma.staff.delete({
    where: { id },
  });
};

/**
 * Toggle staff active status
 * @param {String} id - Staff ID
 * @param {Boolean} isActive - New active status
 * @returns {Promise<Object>} Updated staff
 */
export const toggleStaffActiveStatus = async (id, isActive) => {
  return await prisma.staff.update({
    where: { id },
    data: { isActive },
  });
};
