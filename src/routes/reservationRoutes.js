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
} from "../controller/reservationController.js";
import { customerAuth, ownerAuth } from "../middlewares/authMiddleware.js";
import { paymentProofUploadMiddleware } from "../middlewares/imageUploadMiddleware.js";

const router = express.Router();

// Public routes
router.post("/payment/callback", handlePaymentCallback); // Tripay webhook

// Customer routes
router.post("/", customerAuth, createNewReservation);
router.get("/customer", customerAuth, getFilteredReservations);
router.get("/customer/:id", customerAuth, getReservation);
router.get("/payment-methods", customerAuth, getAvailablePaymentMethods);
router.get("/payment/:reservationId", customerAuth, getPaymentDetails);
router.post(
  "/payment/:reservationId/proof",
  customerAuth,
  paymentProofUploadMiddleware,
  createManualPayment,
);

// Owner routes
router.get("/owner", ownerAuth, getFilteredReservations);
router.get("/owner/:id", ownerAuth, getReservation);
router.put("/owner/:id/status", ownerAuth, updateReservation);
router.get("/owner/payment/:reservationId", ownerAuth, getPaymentDetails);
router.put("/owner/payment/:paymentId/verify", ownerAuth, verifyManualPayment);
router.get("/analytics", ownerAuth, getAnalytics);

export default router;
