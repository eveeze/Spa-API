import prisma from "../config/db.js";

/**
 * Fetches aggregated analytics data for a given date range.
 * This function powers the main KPI cards and the trend chart.
 * @param {Date} startDate - The start of the date range.
 * @param {Date} endDate - The end of the date range.
 */
export const getDashboardOverview = async (startDate, endDate) => {
  // 1. Get pre-calculated daily summaries from the Analytics table
  const dailyData = await prisma.analytics.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: {
      date: "asc",
    },
  });

  // 2. Calculate totals for the entire period
  const totals = dailyData.reduce(
    (acc, day) => {
      acc.totalRevenue += day.totalRevenue;
      acc.completedBookings += day.completedBookings;
      acc.cancelledBookings += day.cancelledBookings;
      return acc;
    },
    { totalRevenue: 0, completedBookings: 0, cancelledBookings: 0 }
  );

  // 3. Get new vs returning customer data
  const customerStats = await getCustomerStats(startDate, endDate);

  return {
    kpi: {
      ...totals,
      averageRevenuePerBooking:
        totals.completedBookings > 0
          ? totals.totalRevenue / totals.completedBookings
          : 0,
      ...customerStats,
    },
    trendChart: {
      labels: dailyData.map((d) => d.date.toISOString().split("T")[0]),
      revenueData: dailyData.map((d) => d.totalRevenue),
      bookingsData: dailyData.map((d) => d.completedBookings),
    },
  };
};

/**
 * Fetches detailed insights like top services, top staff, and peak times.
 * @param {Date} startDate - The start of the date range.
 * @param {Date} endDate - The end of the date range.
 */
export const getDetailedInsights = async (startDate, endDate) => {
  // 1. Get Top 5 Services
  const topServices = await prisma.reservation.groupBy({
    by: ["serviceId"],
    where: {
      status: "COMPLETED",
      updatedAt: { gte: startDate, lte: endDate },
    },
    _count: {
      serviceId: true,
    },
    orderBy: {
      _count: {
        serviceId: "desc",
      },
    },
    take: 5,
  });

  // Enrich with service names
  const serviceIds = topServices.map((s) => s.serviceId);
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds } },
  });
  const serviceMap = services.reduce((map, service) => {
    map[service.id] = service.name;
    return map;
  }, {});
  const formattedTopServices = topServices.map((s) => ({
    name: serviceMap[s.serviceId],
    count: s._count.serviceId,
  }));

  // 2. Get Top 5 Staff
  const topStaff = await prisma.reservation.groupBy({
    by: ["staffId"],
    where: {
      status: "COMPLETED",
      updatedAt: { gte: startDate, lte: endDate },
    },
    _count: {
      staffId: true,
    },
    orderBy: {
      _count: {
        staffId: "desc",
      },
    },
    take: 5,
  });

  // Enrich with staff names
  const staffIds = topStaff.map((s) => s.staffId);
  const staffMembers = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
  });
  const staffMap = staffMembers.reduce((map, staff) => {
    map[staff.id] = staff.name;
    return map;
  }, {});
  const formattedTopStaff = topStaff.map((s) => ({
    name: staffMap[s.staffId],
    count: s._count.staffId,
  }));

  return {
    topServices: formattedTopServices,
    topStaff: formattedTopStaff,
  };
};

/**
 * Helper to get new vs returning customer stats.
 */
async function getCustomerStats(startDate, endDate) {
  const completedReservations = await prisma.reservation.findMany({
    where: {
      status: "COMPLETED",
      updatedAt: { gte: startDate, lte: endDate },
    },
    select: {
      customerId: true,
    },
  });

  if (completedReservations.length === 0) {
    return { newCustomers: 0, returningCustomers: 0 };
  }

  const customerIds = [
    ...new Set(completedReservations.map((r) => r.customerId)),
  ];

  const firstReservations = await prisma.reservation.groupBy({
    by: ["customerId"],
    _min: {
      createdAt: true,
    },
    where: {
      customerId: { in: customerIds },
    },
  });

  let newCustomers = 0;
  firstReservations.forEach((first) => {
    if (first._min.createdAt >= startDate && first._min.createdAt <= endDate) {
      newCustomers++;
    }
  });

  return {
    newCustomers,
    returningCustomers: customerIds.length - newCustomers,
  };
}
