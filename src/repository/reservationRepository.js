// src/repository/reservationRepository.js
import prisma from "../config/db.js";

/**
 * Creates a new reservation in the database
 * @param {Object} reservationData - The reservation data to be created
 * @returns {Promise<Object>} The created reservation with related data
 */
export const createReservation = async (reservationData) => {
  return await prisma.reservation.create({
    data: reservationData,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
        },
      },
      service: true,
      staff: true,
      session: {
        include: {
          timeSlot: {
            include: {
              operatingSchedule: true,
            },
          },
        },
      },
    },
  });
};
/**
 * Get manual reservations with customer info
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} Manual reservations with customer details
 */
export const getManualReservations = async (options = {}) => {
  const { page = 1, limit = 10, status, staffId, startDate, endDate } = options;

  // Build filter conditions
  const where = {
    reservationType: "MANUAL", // Only manual reservations
  };

  if (status) {
    where.status = status;
  }

  if (staffId) {
    where.staffId = staffId;
  }

  // Date range filtering
  if (startDate || endDate) {
    where.session = {
      timeSlot: {
        operatingSchedule: {},
      },
    };

    if (startDate) {
      where.session.timeSlot.operatingSchedule.date = {
        ...(where.session.timeSlot.operatingSchedule.date || {}),
        gte: new Date(startDate),
      };
    }

    if (endDate) {
      where.session.timeSlot.operatingSchedule.date = {
        ...(where.session.timeSlot.operatingSchedule.date || {}),
        lte: new Date(endDate),
      };
    }
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Get total count
  const total = await prisma.reservation.count({ where });

  // Get paginated manual reservations
  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
        },
      },
      service: true,
      staff: true,
      session: {
        include: {
          timeSlot: {
            include: {
              operatingSchedule: true,
            },
          },
        },
      },
      payment: true,
    },
    skip,
    take: limit,
    orderBy: {
      createdAt: "desc",
    },
  });

  return {
    data: reservations,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Update payment with additional notes
 * @param {String} id - The payment ID
 * @param {Object} updateData - The data to update
 * @returns {Promise<Object>} The updated payment
 */
export const updatePaymentWithNotes = async (id, updateData) => {
  return await prisma.payment.update({
    where: { id },
    data: {
      ...updateData,
      updatedAt: new Date(),
    },
    include: {
      reservation: {
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
            },
          },
          service: true,
        },
      },
    },
  });
};
/**
 * Get reservation by ID
 * @param {String} id - The reservation ID
 * @returns {Promise<Object|null>} The reservation or null if not found
 */
export const getReservationById = async (id) => {
  return await prisma.reservation.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
        },
      },
      service: true,
      staff: true,
      session: {
        include: {
          timeSlot: {
            include: {
              operatingSchedule: true,
            },
          },
        },
      },
      payment: true,
    },
  });
};

/**
 * Get reservations with various filter options
 * @param {Object} options - Filter options
 * @param {String} options.customerId - Filter by customer ID
 * @param {String} options.staffId - Filter by staff ID
 * @param {String | Array<String>} options.status - Filter by reservation status or array of statuses
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 * @param {Number} options.page - Page number for pagination
 * @param {Number} options.limit - Items per page for pagination
 * @param {String} options.orderBy - Sorting order (e.g., 'sessionTime:asc')
 * @returns {Promise<Object>} Paginated reservations and count
 */
export const getReservations = async (options = {}) => {
  const {
    customerId,
    staffId,
    status,
    startDate,
    endDate,
    page = 1,
    limit = 10,
    orderBy = "createdAt:desc", // Default sort order
  } = options;

  // Build filter conditions
  const where = {};

  if (customerId) {
    where.customerId = customerId;
  }

  if (staffId) {
    where.staffId = staffId;
  }

  if (status) {
    if (Array.isArray(status)) {
      where.status = { in: status };
    } else {
      where.status = status;
    }
  }

  // Date range filtering
  if (startDate || endDate) {
    where.session = {
      timeSlot: {
        operatingSchedule: {},
      },
    };

    if (startDate) {
      where.session.timeSlot.operatingSchedule.date = {
        ...(where.session.timeSlot.operatingSchedule.date || {}),
        gte: new Date(startDate),
      };
    }

    if (endDate) {
      where.session.timeSlot.operatingSchedule.date = {
        ...(where.session.timeSlot.operatingSchedule.date || {}),
        lte: new Date(endDate),
      };
    }
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Get total count
  const total = await prisma.reservation.count({ where });

  // Determine sorting
  let orderByCondition;
  if (orderBy === "sessionTime:asc") {
    orderByCondition = { session: { timeSlot: { startTime: "asc" } } };
  } else if (orderBy === "sessionTime:desc") {
    orderByCondition = { session: { timeSlot: { startTime: "desc" } } };
  } else {
    orderByCondition = { createdAt: "desc" }; // Default
  }

  // Get paginated reservations
  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
        },
      },
      service: true,
      staff: true,
      session: {
        include: {
          timeSlot: {
            include: {
              operatingSchedule: true,
            },
          },
        },
      },
      payment: true,
    },
    skip,
    take: limit,
    orderBy: orderByCondition,
  });

  return {
    data: reservations,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Update reservation status
 * @param {String} id - The reservation ID
 * @param {String} status - The new status
 * @returns {Promise<Object>} The updated reservation
 */
export const updateReservationStatus = async (id, status) => {
  return await prisma.reservation.update({
    where: { id },
    data: { status },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
        },
      },
      service: true,
      staff: true,
      session: true,
      payment: true,
    },
  });
};
/**
 * Updates reservation details and associated customer info
 * @param {String} id - The reservation ID to update
 * @param {Object} reservationData - The reservation data to update (e.g., babyName, notes)
 * @param {Object} customerData - The customer data to update (e.g., name)
 * @returns {Promise<Object>} The fully updated reservation object
 */
export const updateReservationDetails = async (
  id,
  reservationData,
  customerData
) => {
  return prisma.$transaction(async (tx) => {
    // 1. Update the reservation itself
    const updatedReservation = await tx.reservation.update({
      where: { id },
      data: reservationData,
    });

    // 2. If there's customer data to update, update the related customer
    if (customerData && Object.keys(customerData).length > 0) {
      await tx.customer.update({
        where: { id: updatedReservation.customerId },
        data: customerData,
      });
    }

    // 3. Re-fetch the reservation with all includes to return the complete updated data
    return tx.reservation.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phoneNumber: true },
        },
        service: true,
        staff: true,
        session: {
          include: {
            timeSlot: { include: { operatingSchedule: true } },
          },
        },
        payment: true,
      },
    });
  });
};
/**
 * Updates the payment proof for an existing payment record.
 * @param {string} paymentId - The ID of the payment to update.
 * @param {string} newProofUrl - The URL of the new payment proof file.
 * @returns {Promise<Object>} The updated payment object.
 */
export const updatePaymentProof = async (paymentId, newProofUrl) => {
  return await prisma.payment.update({
    where: { id: paymentId },
    data: {
      paymentProof: newProofUrl,
      paymentStatus: "PENDING", // Reset status untuk verifikasi ulang
      paymentDate: null, // Reset tanggal bayar
    },
  });
};

/**
 * Create payment for a reservation
 * @param {Object} paymentData - The payment data
 * @returns {Promise<Object>} The created payment
 */
export const createPayment = async (paymentData) => {
  // Validate the payment data before creating
  if (
    !paymentData.reservationId ||
    !paymentData.amount ||
    !paymentData.paymentMethod
  ) {
    throw new Error("Missing required payment data");
  }

  return await prisma.payment.create({
    data: paymentData,
    include: {
      reservation: {
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
          service: true,
        },
      },
    },
  });
};
/**
 * Update payment data
 * @param {String} id - The payment ID
 * @param {Object} updateData - The data to update
 * @returns {Promise<Object>} The updated payment
 */
export const updatePayment = async (id, updateData) => {
  return await prisma.payment.update({
    where: { id },
    data: updateData,
    include: {
      reservation: true,
    },
  });
};

/**
 * Find payment by transaction ID
 * @param {String} transactionId - The transaction ID from payment provider
 * @returns {Promise<Object|null>} The payment or null if not found
 */
export const findPaymentByTransactionId = async (transactionId) => {
  return await prisma.payment.findFirst({
    where: { transactionId },
    include: {
      reservation: {
        include: {
          session: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Get payment by reservation ID
 * @param {String} reservationId - The reservation ID
 * @returns {Promise<Object|null>} The payment or null if not found
 */
export const getPaymentByReservationId = async (reservationId) => {
  return await prisma.payment.findUnique({
    where: { reservationId },
    include: {
      reservation: {
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
          service: true,
          staff: true,
          session: {
            include: {
              timeSlot: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Get payment by ID
 * @param {String} id - The payment ID
 * @returns {Promise<Object|null>} The payment or null if not found
 */
export const getPaymentById = async (id) => {
  return await prisma.payment.findUnique({
    where: { id },
    include: {
      reservation: {
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
          service: true,
          staff: true,
          session: true,
        },
      },
    },
  });
};

/**
 * Get reservation analytics with improved calculation logic
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Analytics data
 */
export const getReservationAnalytics = async (startDate, endDate) => {
  // Convert to Date objects if they are strings
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Set to start and end of days
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // Get all reservations in the date range with a more efficient query
  const reservations = await prisma.reservation.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    include: {
      service: true,
      staff: true,
      payment: true,
    },
  });

  // Calculate total reservations
  const totalReservations = reservations.length;

  // Calculate status counts using reduce for better performance
  const statusCounts = reservations.reduce(
    (acc, r) => {
      if (r.status === "COMPLETED") acc.completed++;
      else if (r.status === "CANCELLED") acc.cancelled++;
      else if (r.status === "PENDING" || r.status === "CONFIRMED")
        acc.pending++;
      return acc;
    },
    { completed: 0, cancelled: 0, pending: 0 }
  );

  // Calculate revenue with validation - only count verified payments
  const totalRevenue = reservations.reduce((sum, r) => {
    if (
      r.status === "COMPLETED" &&
      r.payment &&
      r.payment.paymentStatus === "PAID"
    ) {
      return sum + (r.totalPrice || 0);
    }
    return sum;
  }, 0);

  // Find most popular service and staff using frequency map
  const serviceFrequency = new Map();
  const staffFrequency = new Map();

  reservations.forEach((r) => {
    serviceFrequency.set(
      r.serviceId,
      (serviceFrequency.get(r.serviceId) || 0) + 1
    );
    staffFrequency.set(r.staffId, (staffFrequency.get(r.staffId) || 0) + 1);
  });

  // Get the highest frequency items
  let popularServiceId = null;
  let maxServiceFreq = 0;
  for (const [id, freq] of serviceFrequency.entries()) {
    if (freq > maxServiceFreq) {
      maxServiceFreq = freq;
      popularServiceId = id;
    }
  }

  let popularStaffId = null;
  let maxStaffFreq = 0;
  for (const [id, freq] of staffFrequency.entries()) {
    if (freq > maxStaffFreq) {
      maxStaffFreq = freq;
      popularStaffId = id;
    }
  }

  // Return analytics data with added safety checks
  return {
    totalReservations,
    completedReservations: statusCounts.completed,
    cancelledReservations: statusCounts.cancelled,
    pendingReservations: statusCounts.pending,
    totalRevenue: Number(totalRevenue.toFixed(2)), // Ensure proper number formatting
    popularServiceId,
    popularStaffId,
    startDate: start,
    endDate: end,
  };
};

export const getExpiredPendingPayments = async (
  expiredOnly = true,
  graceHours = 0
) => {
  try {
    const now = new Date();

    // Jika ada grace period, kurangi waktu sekarang
    if (graceHours > 0) {
      now.setHours(now.getHours() - graceHours);
    }

    const whereCondition = {
      paymentStatus: "PENDING",
      ...(expiredOnly && {
        expiryDate: {
          lt: now, // Less than current time = expired
        },
      }),
      ...(!expiredOnly && {
        expiryDate: {
          gt: now, // Greater than current time = still pending
        },
      }),
    };

    const payments = await prisma.payment.findMany({
      where: whereCondition,
      include: {
        reservation: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
            service: {
              select: {
                id: true,
                name: true,
              },
            },
            staff: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        expiryDate: "asc",
      },
    });

    return payments;
  } catch (error) {
    console.error("[REPOSITORY ERROR] getExpiredPendingPayments:", error);
    throw error;
  }
};
export const getPendingPaymentsForScheduler = async () => {
  try {
    const now = new Date();

    const payments = await prisma.payment.findMany({
      where: {
        paymentStatus: "PENDING",
        expiryDate: {
          gt: now, // Hanya yang belum expired
        },
      },
      select: {
        id: true,
        expiryDate: true,
        reservationId: true,
      },
      orderBy: {
        expiryDate: "asc",
      },
    });

    return payments;
  } catch (error) {
    console.error("[REPOSITORY ERROR] getPendingPaymentsForScheduler:", error);
    throw error;
  }
};
export const batchUpdatePaymentStatus = async (
  paymentIds,
  status,
  additionalData = {}
) => {
  try {
    const updateData = {
      paymentStatus: status,
      updatedAt: new Date(),
      ...additionalData,
    };

    const result = await prisma.payment.updateMany({
      where: {
        id: {
          in: paymentIds,
        },
      },
      data: updateData,
    });

    return result;
  } catch (error) {
    console.error("[REPOSITORY ERROR] batchUpdatePaymentStatus:", error);
    throw error;
  }
};

// Function untuk update multiple reservations sekaligus
export const batchUpdateReservationStatus = async (reservationIds, status) => {
  try {
    const result = await prisma.reservation.updateMany({
      where: {
        id: {
          in: reservationIds,
        },
      },
      data: {
        status: status,
        updatedAt: new Date(),
      },
    });

    return result;
  } catch (error) {
    console.error("[REPOSITORY ERROR] batchUpdateReservationStatus:", error);
    throw error;
  }
};

// Function untuk get payment statistics
export const getPaymentStats = async () => {
  try {
    const stats = await prisma.payment.groupBy({
      by: ["paymentStatus"],
      _count: {
        id: true,
      },
    });

    const expiredCount = await prisma.payment.count({
      where: {
        paymentStatus: "PENDING",
        expiryDate: {
          lt: new Date(),
        },
      },
    });

    return {
      byStatus: stats,
      expiredPending: expiredCount,
    };
  } catch (error) {
    console.error("[REPOSITORY ERROR] getPaymentStats:", error);
    throw error;
  }
};

/**
 * Get upcoming reservations with various filter options
 * @param {Object} options - Filter options
 * @param {String} options.customerId - Filter by customer ID
 * @param {String} options.staffId - Filter by staff ID
 * @param {Number} options.page - Page number for pagination
 * @param {Number} options.limit - Items per page for pagination
 * @returns {Promise<Object>} Paginated upcoming reservations and count
 */
export const getUpcomingReservations = async (options = {}) => {
  const { customerId, staffId, page = 1, limit = 10 } = options;

  const today = new Date();
  const startOfToday = new Date(today.setHours(0, 0, 0, 0));

  // Build filter conditions
  const where = {
    status: "CONFIRMED", // Only confirmed reservations are upcoming
    session: {
      timeSlot: {
        OR: [
          {
            // Option 1: Sessions on future dates
            operatingSchedule: {
              date: {
                gt: startOfToday, // Date is after the start of today
              },
            },
          },
          {
            // Option 2: Sessions today but in the future
            AND: [
              {
                operatingSchedule: {
                  date: {
                    equals: startOfToday, // Date is exactly today
                  },
                },
              },
              {
                startTime: {
                  gt: new Date(), // TimeSlot's startTime is after the current time
                },
              },
            ],
          },
        ],
      },
    },
  };

  if (customerId) {
    where.customerId = customerId;
  }

  if (staffId) {
    where.staffId = staffId;
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Get total count for pagination
  const total = await prisma.reservation.count({ where });

  // Get paginated upcoming reservations
  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
        },
      },
      service: true,
      staff: true,
      session: {
        include: {
          timeSlot: {
            include: {
              operatingSchedule: true,
            },
          },
        },
      },
      payment: true,
    },
    skip,
    take: limit,
    orderBy: [
      {
        session: {
          timeSlot: {
            operatingSchedule: {
              date: "asc",
            },
          },
        },
      },
      {
        session: {
          timeSlot: {
            startTime: "asc",
          },
        },
      },
    ],
  });

  return {
    data: reservations,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};
