import prisma from "../config/db.js";

/**
 * Membuat rating baru, menghubungkannya dengan reservasi,
 * dan secara otomatis meng-update rata-rata rating di service terkait.
 * @param {object} data - Data rating { reservationId, rating, comment }
 * @returns {Promise<object>} Rating yang baru dibuat
 */
export const createRating = async (data) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Ambil dulu serviceId dari reservasi yang akan dirating
    const reservation = await tx.reservation.findUnique({
      where: { id: data.reservationId },
      select: { serviceId: true },
    });

    if (!reservation) {
      throw new Error("Reservasi tidak ditemukan untuk membuat rating.");
    }
    const serviceId = reservation.serviceId;

    // 2. Buat rating baru
    const newRating = await tx.rating.create({
      data: {
        rating: data.rating,
        comment: data.comment,
        reservationId: data.reservationId,
      },
    });

    // 3. Hitung ulang rata-rata rating HANYA untuk service ini
    const aggregateRatings = await tx.rating.aggregate({
      where: { reservation: { serviceId: serviceId } }, // Filter berdasarkan serviceId
      _avg: {
        rating: true,
      },
    });
    const newAverage = aggregateRatings._avg.rating;

    // 4. Update field averageRating di model Service
    await tx.service.update({
      where: { id: serviceId },
      data: { averageRating: newAverage },
    });

    // 5. Hapus token rating dari reservasi agar link tidak bisa dipakai lagi
    await tx.reservation.update({
      where: { id: data.reservationId },
      data: {
        ratingToken: null,
        ratingTokenExpiresAt: null,
      },
    });

    return newRating;
  });
};

/**
 * Mencari reservasi berdasarkan rating token yang valid (belum expired dan belum dirating).
 * @param {string} token - Token rating dari URL
 * @returns {Promise<object|null>} Data reservasi atau null jika tidak valid
 */
export const findReservationByValidToken = async (token) => {
  return await prisma.reservation.findFirst({
    where: {
      ratingToken: token,
      ratingTokenExpiresAt: {
        gte: new Date(),
      },
      rating: null,
    },
    include: {
      service: { select: { name: true } },
      staff: { select: { name: true } },
    },
  });
};
