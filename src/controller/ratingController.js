import {
  createRating,
  findReservationByValidToken,
} from "../repository/ratingRepository.js";
import { getReservationById } from "../repository/reservationRepository.js";
import { createNotificationForAllOwners } from "../services/notificationService.js";

/**
 * Handler untuk membuat rating oleh pelanggan yang login (ONLINE via Website)
 */
export const createOnlineRating = async (req, res) => {
  const { reservationId, rating, comment } = req.body;
  const customerId = req.customer.id;

  try {
    if (!reservationId || rating === undefined) {
      return res.status(400).json({
        success: false,
        message: "Reservation ID dan rating wajib diisi.",
      });
    }

    const reservation = await getReservationById(reservationId);

    // --- Validasi Ketat ---
    if (!reservation) {
      return res
        .status(404)
        .json({ success: false, message: "Reservasi tidak ditemukan." });
    }
    if (reservation.customerId !== customerId) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak berhak memberikan rating untuk reservasi ini.",
      });
    }
    if (reservation.status !== "COMPLETED") {
      return res.status(400).json({
        success: false,
        message:
          "Rating hanya bisa diberikan untuk reservasi yang sudah selesai.",
      });
    }
    if (reservation.rating) {
      return res.status(409).json({
        success: false,
        message: "Reservasi ini sudah pernah diberi rating.",
      });
    }

    // --- Buat Rating ---
    const newRating = await createRating({
      reservationId,
      rating: parseFloat(rating),
      comment,
    });

    // --- Kirim Notifikasi ke Owner ---
    await createNotificationForAllOwners(
      {
        title: "Rating Baru Diterima!",
        message: `Rating ${rating} bintang diterima untuk layanan ${reservation.service.name} dari ${reservation.customer.name}.`,
        type: "NEW_RATING",
        referenceId: newRating.id,
      },
      { sendPush: true }
    );

    return res.status(201).json({
      success: true,
      message: "Terima kasih atas penilaian Anda!",
      data: newRating,
    });
  } catch (error) {
    console.error("[CREATE ONLINE RATING ERROR]:", error);
    return res
      .status(500)
      .json({ success: false, message: "Gagal menyimpan rating." });
  }
};

/**
 * Handler untuk membuat rating dari link unik (MANUAL)
 */
export const createManualRating = async (req, res) => {
  const { token, rating, comment } = req.body;

  try {
    if (!token || rating === undefined) {
      return res
        .status(400)
        .json({ success: false, message: "Token dan rating wajib diisi." });
    }

    // --- Validasi Token ---
    const reservation = await findReservationByValidToken(token);
    if (!reservation) {
      return res.status(400).json({
        success: false,
        message: "Link rating tidak valid, kedaluwarsa, atau sudah digunakan.",
      });
    }

    // --- Buat Rating ---
    const newRating = await createRating({
      reservationId: reservation.id,
      rating: parseFloat(rating),
      comment,
    });

    // --- Kirim Notifikasi ke Owner ---
    await createNotificationForAllOwners(
      {
        title: "Rating Baru Diterima! (Manual)",
        message: `Rating ${rating} bintang diterima untuk layanan ${reservation.service.name}.`,
        type: "NEW_RATING",
        referenceId: newRating.id,
      },
      { sendPush: true }
    );

    return res.status(201).json({
      success: true,
      message: "Terima kasih atas penilaian Anda!",
      data: newRating,
    });
  } catch (error) {
    console.error("[CREATE MANUAL RATING ERROR]:", error);
    return res
      .status(500)
      .json({ success: false, message: "Gagal menyimpan rating." });
  }
};

/**
 * Handler untuk mengambil detail sesi rating dari token
 * (digunakan oleh halaman rating publik sebelum submit)
 */
export const getRatingSessionByToken = async (req, res) => {
  const { token } = req.params;
  try {
    const reservation = await findReservationByValidToken(token);
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Sesi rating tidak ditemukan atau tidak valid.",
      });
    }

    // Hanya kirim data yang diperlukan ke frontend
    const sessionData = {
      serviceName: reservation.service.name,
      staffName: reservation.staff.name,
    };

    return res.status(200).json({ success: true, data: sessionData });
  } catch (error) {
    console.error("[GET RATING SESSION ERROR]:", error);
    return res
      .status(500)
      .json({ success: false, message: "Terjadi kesalahan pada server." });
  }
};
