// src/controller/reservationController.js
import {
  createReservation,
  getReservationById,
  getReservations,
  updateReservationStatus,
  createPayment,
  updatePayment,
  findPaymentByTransactionId,
  getPaymentByReservationId,
  getReservationAnalytics,
  getPaymentById,
} from "../repository/reservationRepository.js";

import {
  getSessionById,
  updateSessionBookingStatus,
} from "../repository/sessionRepository.js";

import {
  getPaymentChannels,
  createTransaction,
  getTransactionDetails,
  verifyCallbackSignature,
} from "../utils/tripay.js";

import { addHours } from "date-fns";
import * as notificationService from "../services/notificationService.js";

/**
 * Create a new reservation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createNewReservation = async (req, res) => {
  try {
    const {
      serviceId,
      sessionId,
      babyName,
      babyAge,
      priceTierId,
      notes,
      paymentMethod,
    } = req.body;

    // Validate required fields
    if (!serviceId || !sessionId || !babyName || babyAge === undefined) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Get session details
    const session = await getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Check if session is already booked
    if (session.isBooked) {
      return res.status(400).json({
        success: false,
        message: "Session is already booked",
      });
    }

    try {
      // Calculate price with error handling
      const totalPrice = await calculateTotalPrice({
        serviceId,
        babyAge,
        priceTierId,
      });

      // Create reservation object
      const reservationData = {
        customerId: req.customer.id,
        serviceId,
        staffId: session.staffId,
        sessionId,
        babyName,
        babyAge,
        priceTierId,
        notes,
        reservationType: "ONLINE",
        status: "PENDING",
        totalPrice,
      };

      // Create reservation in database using repository function
      const reservation = await createReservation(reservationData);

      // Mark session as booked
      await updateSessionBookingStatus(sessionId, true);

      // If payment method is provided, create payment
      if (paymentMethod) {
        // Get the payment channels from Tripay
        const paymentChannels = await getPaymentChannels();

        // Find the selected payment method
        const selectedPaymentMethod = paymentChannels.find(
          (channel) => channel.code === paymentMethod,
        );

        if (!selectedPaymentMethod) {
          // Rollback the reservation and session status if payment method is invalid
          await updateSessionBookingStatus(sessionId, false);
          await prisma.reservation.delete({ where: { id: reservation.id } });

          return res.status(400).json({
            success: false,
            message: "Invalid payment method",
          });
        }

        // Prepare payment data for Tripay
        const paymentData = {
          reservationId: reservation.id,
          customerName: reservation.customer.name,
          customerEmail: reservation.customer.email,
          customerPhone: reservation.customer.phoneNumber,
          paymentMethod: paymentMethod,
          amount: reservation.totalPrice,
          serviceName: reservation.service.name,
        };

        try {
          // Create transaction in Tripay
          const tripayTransaction = await createTransaction(paymentData);

          // Set payment expiry date (24 hours from now)
          const expiryDate = addHours(new Date(), 24);

          // Create payment record in database
          const payment = await createPayment({
            reservationId: reservation.id,
            amount: reservation.totalPrice,
            paymentMethod: paymentMethod,
            paymentStatus: "PENDING",
            transactionId: tripayTransaction.reference,
            tripayPaymentUrl: tripayTransaction.checkout_url,
            expiryDate: expiryDate,
            tripayResponse: tripayTransaction,
            tripayInstructions: tripayTransaction.instructions || {},
          });

          // Send notification to customer
          await notificationService.sendReservationNotification(
            reservation.customer.id,
            "New Reservation",
            `Your reservation for ${reservation.service.name} has been created. Please complete the payment within 24 hours.`,
            "reservation",
            reservation.id,
          );

          return res.status(201).json({
            success: true,
            message: "Reservation created successfully",
            data: {
              reservation,
              payment: {
                id: payment.id,
                amount: payment.amount,
                paymentMethod: payment.paymentMethod,
                status: payment.paymentStatus,
                expiryDate: payment.expiryDate,
                paymentUrl: tripayTransaction.checkout_url,
                paymentInstructions: tripayTransaction.instructions,
              },
            },
          });
        } catch (tripayError) {
          // Handle Tripay API errors gracefully
          console.error("[TRIPAY TRANSACTION ERROR]:", tripayError);

          // Rollback session and reservation if payment creation fails
          await updateSessionBookingStatus(sessionId, false);
          await prisma.reservation.delete({ where: { id: reservation.id } });

          return res.status(422).json({
            success: false,
            message: "Failed to process payment. Please try again later.",
            error:
              process.env.NODE_ENV === "development"
                ? tripayError.message
                : undefined,
          });
        }
      } else {
        // If no payment method provided, just return the reservation
        return res.status(201).json({
          success: true,
          message: "Reservation created successfully",
          data: reservation,
        });
      }
    } catch (priceError) {
      return res.status(400).json({
        success: false,
        message: "Price calculation failed",
        error:
          process.env.NODE_ENV === "development"
            ? priceError.message
            : "Unable to calculate price for this service and baby age.",
      });
    }
  } catch (error) {
    console.error("[CREATE RESERVATION ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create reservation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get reservations with filters
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getFilteredReservations = async (req, res) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

    // Determine user role and ID for filtering
    const isOwner = !!req.owner;
    const isCustomer = !!req.customer;

    const options = {
      status,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit),
    };

    // If customer is making request, filter by their ID
    if (isCustomer) {
      options.customerId = req.customer.id;
    }

    // If staff ID is provided and request is from owner, filter by staff
    if (req.query.staffId && isOwner) {
      options.staffId = req.query.staffId;
    }

    // Get filtered reservations
    const result = await getReservations(options);

    return res.status(200).json({
      success: true,
      message: "Reservations retrieved successfully",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[GET RESERVATIONS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve reservations",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get reservation by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getReservation = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await getReservationById(id);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Check authorization - owner can see all, customer can only see their own
    if (req.customer && reservation.customerId !== req.customer.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this reservation",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Reservation retrieved successfully",
      data: reservation,
    });
  } catch (error) {
    console.error("[GET RESERVATION ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve reservation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Update reservation status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = [
      "CONFIRMED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be one of: " + validStatuses.join(", "),
      });
    }

    // Get reservation
    const reservation = await getReservationById(id);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Validate status transition
    if (!isValidStatusTransition(reservation.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${reservation.status} to ${status}`,
      });
    }

    // Update reservation status
    const updatedReservation = await updateReservationStatus(id, status);

    // If cancelled, free up the session
    if (status === "CANCELLED") {
      await updateSessionBookingStatus(reservation.sessionId, false);

      // Send notification to customer
      await notificationService.sendReservationNotification(
        reservation.customer.id,
        "Reservation Cancelled",
        `Your reservation for ${reservation.service.name} has been cancelled.`,
        "reservation",
        reservation.id,
      );
    }

    // If completed, send thank you notification
    if (status === "COMPLETED") {
      await notificationService.sendReservationNotification(
        reservation.customer.id,
        "Service Completed",
        `Thank you for using our service. Your ${reservation.service.name} has been completed.`,
        "reservation",
        reservation.id,
      );
    }

    return res.status(200).json({
      success: true,
      message: "Reservation status updated successfully",
      data: updatedReservation,
    });
  } catch (error) {
    console.error("[UPDATE RESERVATION ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update reservation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Handle Tripay callback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handlePaymentCallback = async (req, res) => {
  try {
    const callbackData = req.body;

    // Verify callback signature
    if (!verifyCallbackSignature(callbackData)) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }

    // Extract transaction reference
    const { reference, status, merchant_ref } = callbackData;

    // Find payment by transaction ID
    const payment = await findPaymentByTransactionId(reference);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Update payment status based on Tripay status
    let paymentStatus;
    let reservationStatus = payment.reservation.status;

    switch (status) {
      case "PAID":
        paymentStatus = "PAID";
        reservationStatus = "CONFIRMED";
        break;
      case "EXPIRED":
        paymentStatus = "EXPIRED";
        reservationStatus = "EXPIRED";
        // Free up session slot
        await updateSessionBookingStatus(payment.reservation.sessionId, false);
        break;
      case "FAILED":
        paymentStatus = "FAILED";
        reservationStatus = "CANCELLED";
        // Free up session slot
        await updateSessionBookingStatus(payment.reservation.sessionId, false);
        break;
      case "REFUND":
        paymentStatus = "REFUNDED";
        reservationStatus = "CANCELLED";
        // Free up session slot
        await updateSessionBookingStatus(payment.reservation.sessionId, false);
        break;
      default:
        paymentStatus = payment.paymentStatus;
    }

    // Update payment in database
    await updatePayment(payment.id, {
      paymentStatus,
      paymentDate: paymentStatus === "PAID" ? new Date() : null,
      tripayResponse: callbackData, // Store full callback data
    });

    // Update reservation status if needed
    if (reservationStatus !== payment.reservation.status) {
      await updateReservationStatus(payment.reservation.id, reservationStatus);

      // Send notification based on status
      if (reservationStatus === "CONFIRMED") {
        await notificationService.sendReservationNotification(
          payment.reservation.customer.id,
          "Payment Confirmed",
          `Your payment for ${payment.reservation.service.name} has been confirmed. Your reservation is now confirmed.`,
          "payment",
          payment.reservation.id,
        );
      } else if (
        reservationStatus === "EXPIRED" ||
        reservationStatus === "CANCELLED"
      ) {
        await notificationService.sendReservationNotification(
          payment.reservation.customer.id,
          "Reservation Cancelled",
          `Your reservation for ${payment.reservation.service.name} has been cancelled due to payment issue.`,
          "payment",
          payment.reservation.id,
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Callback processed successfully",
    });
  } catch (error) {
    console.error("[PAYMENT CALLBACK ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process payment callback",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get payment details for a reservation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getPaymentDetails = async (req, res) => {
  try {
    const { reservationId } = req.params;

    // Get reservation details
    const reservation = await getReservationById(reservationId);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Check authorization - owner can see all, customer can only see their own
    if (req.customer && reservation.customerId !== req.customer.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this payment",
      });
    }

    // Get payment details
    const payment = await getPaymentByReservationId(reservationId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found for this reservation",
      });
    }

    // If payment status is pending, check with Tripay for latest status
    if (payment.paymentStatus === "PENDING" && payment.transactionId) {
      try {
        const tripayDetails = await getTransactionDetails(
          payment.transactionId,
        );

        // Update payment status if it has changed
        if (tripayDetails.status !== payment.paymentStatus) {
          let newPaymentStatus;
          let newReservationStatus = reservation.status;

          switch (tripayDetails.status) {
            case "PAID":
              newPaymentStatus = "PAID";
              newReservationStatus = "CONFIRMED";
              break;
            case "EXPIRED":
              newPaymentStatus = "EXPIRED";
              newReservationStatus = "EXPIRED";
              break;
            case "FAILED":
              newPaymentStatus = "FAILED";
              newReservationStatus = "CANCELLED";
              break;
            case "REFUND":
              newPaymentStatus = "REFUNDED";
              newReservationStatus = "CANCELLED";
              break;
            default:
              newPaymentStatus = payment.paymentStatus;
          }

          // Update payment in database
          if (newPaymentStatus !== payment.paymentStatus) {
            await updatePayment(payment.id, {
              paymentStatus: newPaymentStatus,
              paymentDate: newPaymentStatus === "PAID" ? new Date() : null,
              tripayResponse: tripayDetails,
            });

            // Update payment object for response
            payment.paymentStatus = newPaymentStatus;
            payment.paymentDate =
              newPaymentStatus === "PAID" ? new Date() : null;
            payment.tripayResponse = tripayDetails;
          }

          // Update reservation status if needed
          if (newReservationStatus !== reservation.status) {
            await updateReservationStatus(reservationId, newReservationStatus);
            reservation.status = newReservationStatus;
          }
        }
      } catch (error) {
        console.error("[GET TRIPAY TRANSACTION DETAILS ERROR]:", error);
        // Continue with existing payment data if Tripay check fails
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment details retrieved successfully",
      data: {
        payment: {
          id: payment.id,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          status: payment.paymentStatus,
          transactionId: payment.transactionId,
          paymentDate: payment.paymentDate,
          expiryDate: payment.expiryDate,
          paymentProof: payment.paymentProof,
          paymentUrl: payment.tripayPaymentUrl, // Reused for Tripay checkout URL
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
        reservation: {
          id: reservation.id,
          status: reservation.status,
          serviceName: reservation.service.name,
          serviceId: reservation.serviceId,
          customerName: reservation.customer.name,
          customerId: reservation.customerId,
          sessionDate: reservation.session.timeSlot.operatingSchedule.date,
          sessionTime: `${formatTime(reservation.session.timeSlot.startTime)} - ${formatTime(reservation.session.timeSlot.endTime)}`,
          staffName: reservation.staff.name,
          totalPrice: reservation.totalPrice,
        },
      },
    });
  } catch (error) {
    console.error("[GET PAYMENT DETAILS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payment details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get payment methods from Tripay
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getAvailablePaymentMethods = async (req, res) => {
  try {
    const paymentChannels = await getPaymentChannels();

    return res.status(200).json({
      success: true,
      message: "Payment methods retrieved successfully",
      data: paymentChannels,
    });
  } catch (error) {
    console.error("[GET PAYMENT METHODS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payment methods",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Create manual payment with proof upload
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createManualPayment = async (req, res) => {
  try {
    const { reservationId } = req.params;

    // Check if payment proof was uploaded
    if (!req.paymentProofUrl) {
      return res.status(400).json({
        success: false,
        message: "Payment proof is required",
      });
    }

    // Get reservation with full details
    const reservation = await getReservationById(reservationId);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Verify ownership
    if (req.customer && reservation.customerId !== req.customer.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this reservation",
      });
    }

    // Validate reservation status - can't add payment for cancelled/expired reservations
    if (["CANCELLED", "EXPIRED"].includes(reservation.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot add payment to a ${reservation.status.toLowerCase()} reservation`,
      });
    }

    // Check if payment already exists
    const existingPayment = await getPaymentByReservationId(reservationId);

    // Get all required data for the transaction record
    const paymentData = {
      amount: reservation.totalPrice,
      paymentMethod: "BANK_TRANSFER",
      paymentStatus: "PENDING", // Owner will need to verify
      paymentProof: req.paymentProofUrl,
      expiryDate: addHours(new Date(), 24), // 24 hours from now
    };

    if (existingPayment) {
      // Validate payment status - can't update already paid payments
      if (existingPayment.paymentStatus === "PAID") {
        return res.status(400).json({
          success: false,
          message: "Payment has already been completed for this reservation",
        });
      }

      // Update existing payment
      const updatedPayment = await updatePayment(
        existingPayment.id,
        paymentData,
      );

      // Notify owner about new payment proof
      await notificationService.sendNotificationToOwner(
        "Updated Payment Proof",
        `A new payment proof has been uploaded for reservation #${reservation.id}`,
        "payment",
        reservation.id,
      );

      return res.status(200).json({
        success: true,
        message: "Payment proof uploaded successfully",
        data: {
          payment: {
            id: updatedPayment.id,
            amount: updatedPayment.amount,
            paymentMethod: updatedPayment.paymentMethod,
            status: updatedPayment.paymentStatus,
            paymentProof: updatedPayment.paymentProof,
            expiryDate: updatedPayment.expiryDate,
            createdAt: updatedPayment.createdAt,
            updatedAt: updatedPayment.updatedAt,
          },
          reservation: {
            id: reservation.id,
            status: reservation.status,
            serviceName: reservation.service.name,
          },
        },
      });
    } else {
      // Create new payment
      const newPayment = await createPayment({
        reservationId,
        ...paymentData,
      });

      // Notify owner about new payment proof
      await notificationService.sendNotificationToOwner(
        "New Payment Proof",
        `A payment proof has been uploaded for reservation #${reservation.id}`,
        "payment",
        reservation.id,
      );

      return res.status(201).json({
        success: true,
        message: "Payment proof uploaded successfully",
        data: {
          payment: {
            id: newPayment.id,
            amount: newPayment.amount,
            paymentMethod: newPayment.paymentMethod,
            status: newPayment.paymentStatus,
            paymentProof: newPayment.paymentProof,
            expiryDate: newPayment.expiryDate,
            createdAt: newPayment.createdAt,
            updatedAt: newPayment.updatedAt,
          },
          reservation: {
            id: reservation.id,
            status: reservation.status,
            serviceName: reservation.service.name,
          },
        },
      });
    }
  } catch (error) {
    console.error("[MANUAL PAYMENT ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process manual payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
/**
 * Verify manual payment (owner only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const verifyManualPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { isVerified } = req.body;

    // Validate request body
    if (isVerified === undefined) {
      return res.status(400).json({
        success: false,
        message: "isVerified field is required",
      });
    }

    // Get payment using repository function
    const payment = await getPaymentById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Update payment status based on verification
    const paymentStatus = isVerified ? "PAID" : "FAILED";
    const reservationStatus = isVerified ? "CONFIRMED" : "CANCELLED";

    // Update payment
    const updatedPayment = await updatePayment(paymentId, {
      paymentStatus,
      paymentDate: isVerified ? new Date() : null,
    });

    // Update reservation
    const updatedReservation = await updateReservationStatus(
      payment.reservationId,
      reservationStatus,
    );

    // If rejected, free up the session
    if (!isVerified) {
      await updateSessionBookingStatus(payment.reservation.sessionId, false);
    }

    // Send notification to customer
    if (isVerified) {
      await notificationService.sendReservationNotification(
        payment.reservation.customerId,
        "Payment Verified",
        "Your payment has been verified and your reservation is now confirmed.",
        "payment",
        payment.reservationId,
      );
    } else {
      await notificationService.sendReservationNotification(
        payment.reservation.customerId,
        "Payment Rejected",
        "Your payment has been rejected. Please contact us for more information.",
        "payment",
        payment.reservationId,
      );
    }

    return res.status(200).json({
      success: true,
      message: `Payment ${isVerified ? "verified" : "rejected"} successfully`,
      data: {
        payment: updatedPayment,
        reservation: updatedReservation,
      },
    });
  } catch (error) {
    console.error("[VERIFY PAYMENT ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get reservation analytics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    // Get analytics data
    const analytics = await getReservationAnalytics(startDate, endDate);

    return res.status(200).json({
      success: true,
      message: "Analytics retrieved successfully",
      data: analytics,
    });
  } catch (error) {
    console.error("[GET ANALYTICS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve analytics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Helper function to validate status transitions
const isValidStatusTransition = (currentStatus, newStatus) => {
  const validTransitions = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: [], // Terminal state
    CANCELLED: [], // Terminal state
    EXPIRED: [], // Terminal state
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
};

// Helper function to format time
const formatTime = (dateTimeString) => {
  const date = new Date(dateTimeString);
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Calculate total price based on service and price tier
 * @param {Object} bookingData - The booking data
 * @returns {Promise<number>} The calculated price
 */
const calculateTotalPrice = async (bookingData) => {
  const { serviceId, babyAge, priceTierId } = bookingData;

  try {
    // Get service details
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        priceTiers: true,
      },
    });

    if (!service) {
      throw new Error("Service not found");
    }

    // If using price tier and tier ID is provided
    if (service.hasPriceTiers && priceTierId) {
      const selectedTier = service.priceTiers.find(
        (tier) => tier.id === priceTierId,
      );
      if (!selectedTier) {
        throw new Error("Selected price tier not found");
      }
      return selectedTier.price;
    }

    // If using price tier but no specific tier ID provided, find by baby age
    if (service.hasPriceTiers && babyAge !== undefined) {
      const applicableTier = service.priceTiers.find(
        (tier) => babyAge >= tier.minBabyAge && babyAge <= tier.maxBabyAge,
      );

      if (!applicableTier) {
        throw new Error(
          `No applicable price tier found for baby age ${babyAge} months`,
        );
      }

      return applicableTier.price;
    }

    // If not using price tiers, return base price
    if (service.price !== null && service.price !== undefined) {
      return service.price;
    }

    throw new Error("Could not determine price for this service");
  } catch (error) {
    console.error("Price calculation error:", error);
    throw error;
  }
};
