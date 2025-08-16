import express from "express";
import {
  createOnlineRating,
  createManualRating,
  getRatingSessionByToken,
} from "../controller/ratingController.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// [PUBLIC] Endpoint untuk mengambil detail sesi rating dari token.
// Frontend akan memanggil ini saat halaman rating manual dimuat untuk menampilkan info.
// Contoh: GET /api/ratings/session/abc-123-token-xyz
router.get("/session/:token", getRatingSessionByToken);

// [CUSTOMER-ONLY] Endpoint untuk pelanggan ONLINE yang sudah login.
// Memerlukan token otentikasi customer di header.
// Contoh: POST /api/ratings
router.post("/", customerAuth, createOnlineRating);

// [PUBLIC] Endpoint untuk pelanggan MANUAL dari link (tidak perlu login).
// Token dikirim di dalam body request.
// Contoh: POST /api/ratings/manual
router.post("/manual", createManualRating);

export default router;
