// utils/tripay.js
import axios from "axios";
import crypto from "crypto";

// Tripay API configuration
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE;
const TRIPAY_API_URL = process.env.TRIPAY_API_URL || "https://tripay.co.id/api";
const CALLBACK_URL =
  process.env.CALLBACK_URL || "https://yourdomain.com/api/payment/callback";
const RETURN_URL =
  process.env.RETURN_URL || "https://yourdomain.com/payment/success";

// Validate required environment variables
const validateConfig = () => {
  const requiredEnvVars = {
    TRIPAY_API_KEY,
    TRIPAY_PRIVATE_KEY,
    TRIPAY_MERCHANT_CODE,
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`,
    );
  }
};

/**
 * Get available payment channels from Tripay with retry logic
 * @param {Number} retries - Number of retries if request fails
 * @returns {Promise<Array>} List of payment channels
 */
export const getPaymentChannels = async (retries = 2) => {
  validateConfig();

  try {
    const response = await axios.get(
      `${TRIPAY_API_URL}/merchant/payment-channel`,
      {
        headers: {
          Authorization: `Bearer ${TRIPAY_API_KEY}`,
        },
        timeout: 10000, // 10 second timeout
      },
    );

    if (!response.data.success) {
      throw new Error(
        response.data.message || "Failed to get payment channels",
      );
    }

    return response.data.data;
  } catch (error) {
    console.error(
      "[TRIPAY ERROR] Get payment channels:",
      error.response?.data || error.message,
    );

    // Implement retry logic
    if (
      retries > 0 &&
      (error.code === "ECONNABORTED" || error.response?.status >= 500)
    ) {
      console.log(`Retrying getPaymentChannels, ${retries} attempts left`);
      return getPaymentChannels(retries - 1);
    }

    throw new Error(
      "Failed to get payment channels: " +
        (error.response?.data?.message || error.message),
    );
  }
};

/**
 * Calculate signature for Tripay transaction
 * @param {String} merchantCode - Merchant code
 * @param {String} merchantRef - Merchant reference (reservation ID)
 * @param {Number} amount - Transaction amount
 * @returns {String} Calculated signature
 */
const calculateSignature = (merchantCode, merchantRef, amount) => {
  if (!merchantCode || !merchantRef || amount === undefined) {
    throw new Error("Missing required parameters for signature calculation");
  }

  const amountStr = String(amount); // Ensure amount is a string for signature
  const signatureString = `${merchantCode}${merchantRef}${amountStr}`;

  return crypto
    .createHmac("sha256", TRIPAY_PRIVATE_KEY)
    .update(signatureString)
    .digest("hex");
};

/**
 * Create a payment transaction in Tripay with validation
 * @param {Object} paymentData - Payment data
 * @param {String} paymentData.reservationId - Reservation ID
 * @param {String} paymentData.customerName - Customer name
 * @param {String} paymentData.customerEmail - Customer email
 * @param {String} paymentData.customerPhone - Customer phone number
 * @param {String} paymentData.paymentMethod - Payment method code
 * @param {Number} paymentData.amount - Transaction amount
 * @param {String} paymentData.serviceName - Service name
 * @returns {Promise<Object>} Transaction details from Tripay
 */
export const createTransaction = async (paymentData) => {
  validateConfig();

  // Validate required fields
  const requiredFields = [
    "reservationId",
    "customerName",
    "customerEmail",
    "customerPhone",
    "paymentMethod",
    "amount",
    "serviceName",
  ];

  const missingFields = requiredFields.filter((field) => !paymentData[field]);

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required payment data: ${missingFields.join(", ")}`,
    );
  }

  try {
    const {
      reservationId,
      customerName,
      customerEmail,
      customerPhone,
      paymentMethod,
      amount,
      serviceName,
    } = paymentData;

    // Ensure amount is a number and has valid format (no more than 2 decimal places)
    const formattedAmount = parseFloat(parseFloat(amount).toFixed(2));
    if (isNaN(formattedAmount) || formattedAmount <= 0) {
      throw new Error("Invalid payment amount");
    }

    const merchantRef = `BABYSPA-${reservationId}`;
    const signature = calculateSignature(
      TRIPAY_MERCHANT_CODE,
      merchantRef,
      formattedAmount,
    );

    const payload = {
      method: paymentMethod,
      merchant_ref: merchantRef,
      amount: formattedAmount,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      order_items: [
        {
          name: serviceName,
          price: formattedAmount,
          quantity: 1,
        },
      ],
      callback_url: CALLBACK_URL,
      return_url: RETURN_URL,
      expired_time: 24 * 60 * 60, // 24 hours in seconds
      signature: signature,
    };

    const response = await axios.post(
      `${TRIPAY_API_URL}/transaction/create`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${TRIPAY_API_KEY}`,
        },
        timeout: 15000, // 15 second timeout for transaction creation
      },
    );

    if (!response.data.success) {
      throw new Error(response.data.message || "Transaction creation failed");
    }

    return response.data.data;
  } catch (error) {
    console.error(
      "[TRIPAY ERROR] Create transaction:",
      error.response?.data || error.message,
    );

    // Enhanced error message with more details
    const errorResponse = error.response?.data;
    const errorMessage = errorResponse?.message || error.message;
    const errorDetail = errorResponse?.data
      ? JSON.stringify(errorResponse.data)
      : "";

    throw new Error(
      `Failed to create payment transaction: ${errorMessage} ${errorDetail}`,
    );
  }
};

/**
 * Get transaction details from Tripay with validation
 * @param {String} reference - Transaction reference
 * @returns {Promise<Object>} Transaction details
 */
export const getTransactionDetails = async (reference) => {
  validateConfig();

  if (!reference) {
    throw new Error("Transaction reference is required");
  }

  try {
    const response = await axios.get(
      `${TRIPAY_API_URL}/transaction/detail?reference=${reference}`,
      {
        headers: {
          Authorization: `Bearer ${TRIPAY_API_KEY}`,
        },
        timeout: 10000, // 10 second timeout
      },
    );

    if (!response.data.success) {
      throw new Error(
        response.data.message || "Failed to get transaction details",
      );
    }

    return response.data.data;
  } catch (error) {
    console.error(
      "[TRIPAY ERROR] Get transaction details:",
      error.response?.data || error.message,
    );
    throw new Error(
      "Failed to get transaction details: " +
        (error.response?.data?.message || error.message),
    );
  }
};

/**
 * Verify callback signature from Tripay with enhanced security
 * @param {Object} callbackData - Callback data from Tripay
 * @returns {Boolean} Whether the signature is valid
 */
export const verifyCallbackSignature = (callbackData) => {
  try {
    validateConfig();

    const { merchant_ref, reference, status, signature } = callbackData;

    // Validate required fields are present
    if (!merchant_ref || !reference || !status || !signature) {
      console.error(
        "[TRIPAY CALLBACK] Missing required fields for signature verification",
      );
      return false;
    }

    const validSignature = crypto
      .createHmac("sha256", TRIPAY_PRIVATE_KEY)
      .update(`${merchant_ref}${reference}${status}`)
      .digest("hex");

    const isValid = signature === validSignature;

    // Log verification attempt for security audit
    if (!isValid) {
      console.error(
        `[TRIPAY CALLBACK] Invalid signature detected for transaction ${reference}`,
      );
    }

    return isValid;
  } catch (error) {
    console.error("[TRIPAY ERROR] Verify callback signature:", error.message);
    return false;
  }
};
