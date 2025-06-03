// src/routes/reservationRoutes.js
import express from "express";
import {
  createNewReservation,
  getFilteredReservations,
  getReservation,
  updateReservation,
  handlePaymentCallback,
  getPaymentDetails,
  getAvailablePaymentMethods,
  createManualPayment,
  verifyManualPayment,
  getAnalytics,
  createManualReservation,
  updateManualReservationPayment,
  uploadManualPaymentProof,
  testTripayIntegration,
  getUpcomingReservationsHandler,
  getUpcomingReservationsForDay,
} from "../controller/reservationController.js";
import {
  customerAuth,
  ownerAuth,
  callbackMiddleware,
  captureRawBodyForCallback,
} from "../middlewares/authMiddleware.js";
import { paymentProofUploadMiddleware } from "../middlewares/imageUploadMiddleware.js";

const router = express.Router();

// BARU: Test route untuk development
if (process.env.NODE_ENV === "development") {
  router.get("/test/tripay", ownerAuth, testTripayIntegration);
}

// Public routes
router.post(
  "/payment/callback",
  captureRawBodyForCallback,
  callbackMiddleware,
  handlePaymentCallback
);
// Customer routes
router.get("/customer", customerAuth, getFilteredReservations);
router.get("/payment-methods", customerAuth, getAvailablePaymentMethods);
router.post("/", customerAuth, createNewReservation);
router.get("/customer/:id", customerAuth, getReservation);
router.get("/payment/:reservationId", customerAuth, getPaymentDetails);
router.post(
  "/payment/:reservationId/proof",
  customerAuth,
  paymentProofUploadMiddleware,
  createManualPayment
);

// Owner routes
router.get("/owner", ownerAuth, getFilteredReservations);
router.get("/owner/payment-methods", ownerAuth, getAvailablePaymentMethods); // MOVED UP
router.get("/analytics", ownerAuth, getAnalytics); // MOVED UP

// Manual booking routes (untuk owner) - specific routes
router.post(
  "/owner/manual",
  ownerAuth,
  paymentProofUploadMiddleware,
  createManualReservation
);

// Owner routes
router.get("/owner/upcoming", ownerAuth, getUpcomingReservationsHandler); // New route for owner's upcoming reservations (can be filtered by staffId via query param)

router.get("/owner/:id", ownerAuth, getReservation);
router.get(
  "/owner/dashboard/upcoming-by-day",
  ownerAuth,
  getUpcomingReservationsForDay
);
router.put("/owner/:id/status", ownerAuth, updateReservation);
router.get("/owner/payment/:reservationId", ownerAuth, getPaymentDetails);
router.put("/owner/payment/:paymentId/verify", ownerAuth, verifyManualPayment);

router.put(
  "/owner/manual/:reservationId/payment",
  ownerAuth,
  updateManualReservationPayment
);
router.post(
  "/owner/manual/:reservationId/payment-proof",
  ownerAuth,
  paymentProofUploadMiddleware,
  uploadManualPaymentProof
);

export default router;
