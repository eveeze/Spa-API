// src/repository/analyticsRepository.js
import prisma from "../config/db.js";
import { startOfDay, endOfDay, subDays, format, addDays } from "date-fns";

/**
 * Mengambil data KPI utama untuk overview dashboard.
 */
export const getDashboardOverview = async () => {
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const tomorrowStart = startOfDay(addDays(today, 1));
  const tomorrowEnd = endOfDay(addDays(today, 1));

  // 1. Total Pendapatan Hari Ini (dari reservasi yang COMPLETED hari ini)
  const revenueToday = await prisma.reservation.aggregate({
    _sum: {
      totalPrice: true,
    },
    where: {
      status: "COMPLETED",
      updatedAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

  // 2. Jumlah Pelanggan Baru Hari Ini
  const newCustomersToday = await prisma.customer.count({
    where: {
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

  // 3. Jumlah Reservasi yang Akan Datang (Besok)
  const upcomingReservationsTomorrow = await prisma.reservation.count({
    where: {
      status: "CONFIRMED",
      session: {
        timeSlot: {
          startTime: {
            gte: tomorrowStart,
            lte: tomorrowEnd,
          },
        },
      },
    },
  });

  return {
    revenueToday: revenueToday._sum.totalPrice || 0,
    newCustomersToday,
    upcomingReservationsTomorrow,
  };
};

/**
 * Menghitung statistik reservasi (total, selesai, dibatalkan) dalam rentang waktu.
 * @param {Date} startDate - Tanggal mulai.
 * @param {Date} endDate - Tanggal akhir.
 */
export const getReservationStats = async (startDate, endDate) => {
  const statusCounts = await prisma.reservation.groupBy({
    by: ["status"],
    _count: {
      status: true,
    },
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const stats = {
    total: 0,
    completed: 0,
    cancelled: 0,
    pending: 0,
    confirmed: 0,
    in_progress: 0,
    expired: 0,
  };

  for (const group of statusCounts) {
    const statusKey = group.status
      .toLowerCase()
      .replace(/_(\w)/g, (match, p1) => p1.toUpperCase());
    if (stats.hasOwnProperty(statusKey)) {
      stats[statusKey] = group._count.status;
    }
    stats.total += group._count.status;
  }

  return stats;
};

/**
 * Mengambil data pendapatan untuk grafik tren dalam rentang waktu tertentu.
 * @param {number} days - Jumlah hari ke belakang untuk ditarik datanya.
 */
export const getRevenueChartData = async (days = 7) => {
  const endDate = endOfDay(new Date());
  const startDate = startOfDay(subDays(endDate, days - 1));

  const completedReservations = await prisma.reservation.findMany({
    where: {
      status: "COMPLETED",
      updatedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      totalPrice: true,
      updatedAt: true,
    },
  });

  // Mengelompokkan pendapatan per hari
  const dailyRevenue = {};
  for (let i = 0; i < days; i++) {
    const date = format(subDays(endDate, i), "yyyy-MM-dd");
    dailyRevenue[date] = 0;
  }

  completedReservations.forEach((reservation) => {
    const date = format(new Date(reservation.updatedAt), "yyyy-MM-dd");
    if (dailyRevenue[date] !== undefined) {
      dailyRevenue[date] += reservation.totalPrice;
    }
  });

  // Mengubah format menjadi array yang cocok untuk grafik
  return Object.entries(dailyRevenue)
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => new Date(a.date) - new Date(b.date)); // Urutkan dari tanggal terlama
};

/**
 * Mengambil daftar layanan terlaris berdasarkan jumlah reservasi.
 * @param {number} limit - Jumlah layanan yang ingin ditampilkan.
 * @param {Date} startDate - Tanggal mulai.
 * @param {Date} endDate - Tanggal akhir.
 */
export const getTopPerformingServices = async (
  limit = 5,
  startDate,
  endDate
) => {
  const topServices = await prisma.reservation.groupBy({
    by: ["serviceId"],
    _count: {
      serviceId: true,
    },
    where: {
      status: { in: ["COMPLETED", "CONFIRMED", "IN_PROGRESS"] },
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: {
      _count: {
        serviceId: "desc",
      },
    },
    take: limit,
  });

  // Mengambil detail nama layanan
  const serviceIds = topServices.map((s) => s.serviceId);
  if (serviceIds.length === 0) return [];

  const services = await prisma.service.findMany({
    where: {
      id: { in: serviceIds },
    },
    select: {
      id: true,
      name: true,
      imageUrl: true,
    },
  });

  const serviceMap = services.reduce((map, service) => {
    map[service.id] = service;
    return map;
  }, {});

  return topServices.map((s) => ({
    ...serviceMap[s.serviceId],
    bookingCount: s._count.serviceId,
  }));
};

/**
 * Mengambil daftar staf dengan kinerja terbaik berdasarkan jumlah layanan yang diselesaikan.
 * @param {number} limit - Jumlah staf yang ingin ditampilkan.
 * @param {Date} startDate - Tanggal mulai.
 * @param {Date} endDate - Tanggal akhir.
 */
export const getTopPerformingStaff = async (limit = 5, startDate, endDate) => {
  const topStaff = await prisma.reservation.groupBy({
    by: ["staffId"],
    _count: {
      staffId: true,
    },
    where: {
      status: "COMPLETED",
      updatedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: {
      _count: {
        staffId: "desc",
      },
    },
    take: limit,
  });

  // Mengambil detail nama staf
  const staffIds = topStaff.map((s) => s.staffId);
  if (staffIds.length === 0) return [];

  const staffDetails = await prisma.staff.findMany({
    where: {
      id: { in: staffIds },
    },
    select: {
      id: true,
      name: true,
      profilePicture: true,
    },
  });

  const staffMap = staffDetails.reduce((map, staff) => {
    map[staff.id] = staff;
    return map;
  }, {});

  return topStaff.map((s) => ({
    ...staffMap[s.staffId],
    completedServices: s._count.staffId,
  }));
};

/**
 * [BARU] Mengambil statistik rating layanan.
 * @param {number} limit - Jumlah layanan yang ingin ditampilkan.
 */
export const getServiceRatingStats = async (limit = 5) => {
  // Ambil semua layanan yang memiliki averageRating (sudah pernah dirating)
  const servicesWithRating = await prisma.service.findMany({
    where: {
      averageRating: {
        not: null,
      },
    },
    select: {
      id: true,
      name: true,
      averageRating: true,
    },
  });

  // Urutkan untuk mendapatkan yang tertinggi dan terendah
  const sortedServices = servicesWithRating.sort(
    (a, b) => b.averageRating - a.averageRating
  );

  const topRated = sortedServices.slice(0, limit);
  const lowestRated = sortedServices.slice(-limit).reverse(); // Ambil dari akhir lalu balik urutannya

  const overallAverage =
    servicesWithRating.reduce((sum, s) => sum + s.averageRating, 0) /
      servicesWithRating.length || 0;

  return {
    overallAverageRating: parseFloat(overallAverage.toFixed(2)),
    topRatedServices: topRated,
    lowestRatedServices: lowestRated,
  };
};
