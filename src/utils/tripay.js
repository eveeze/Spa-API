// utils/tripay.js
import axios from "axios";
import crypto from "crypto";

// Tripay API configuration
const TRIPAY_MODE = process.env.TRIPAY_MODE || "sandbox";
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;

// PERBAIKAN UTAMA: Tambahkan .trim() untuk membuang spasi/enter tersembunyi
const TRIPAY_PRIVATE_KEY = (process.env.TRIPAY_PRIVATE_KEY || "").trim();

const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// API URL based on mode
const TRIPAY_API_URL =
  TRIPAY_MODE === "production"
    ? process.env.TRIPAY_API_URL_PRODUCTION || "https://tripay.co.id/api"
    : process.env.TRIPAY_API_URL || "https://tripay.co.id/api-sandbox";

const CALLBACK_URL =
  process.env.CALLBACK_URL ||
  "http://localhost:3000/api/reservations/payment/callback";

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
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }

  // Optional: Log mode untuk debugging (jangan log key full)
  // console.log(`[TRIPAY] Running in ${TRIPAY_MODE} mode`);
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
      }
    );

    if (!response.data.success) {
      throw new Error(
        response.data.message || "Failed to get payment channels"
      );
    }

    console.log(`[TRIPAY] Found ${response.data.data.length} payment channels`);
    return response.data.data;
  } catch (error) {
    console.error(
      "[TRIPAY ERROR] Get payment channels:",
      error.response?.data || error.message
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
        (error.response?.data?.message || error.message)
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

  const amountStr = String(amount);
  const signatureString = `${merchantCode}${merchantRef}${amountStr}`;

  console.log(`[TRIPAY] Signature string: ${signatureString}`);

  return crypto
    .createHmac("sha256", TRIPAY_PRIVATE_KEY)
    .update(signatureString)
    .digest("hex");
};

/**
 * Create a payment transaction in Tripay with validation
 * @param {Object} paymentData - Payment data
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
      `Missing required payment data: ${missingFields.join(", ")}`
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
      formattedAmount
    );

    // FIXED: Calculate expiry time properly - current time + 24 hours in seconds
    const currentTime = Math.floor(Date.now() / 1000); // Current timestamp in seconds
    const expiryTime = currentTime + 24 * 60 * 60; // Add 24 hours in seconds
    const return_url = `${FRONTEND_URL}/payment/status?reservation_id=${reservationId}`;

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
      return_url: return_url,
      expired_time: expiryTime,
      signature: signature,
    };

    console.log(`[TRIPAY] Creating transaction for ${merchantRef}`);
    console.log(`[TRIPAY] Amount: ${formattedAmount}`);

    const response = await axios.post(
      `${TRIPAY_API_URL}/transaction/create`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${TRIPAY_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000, // 15 second timeout for transaction creation
      }
    );

    if (!response.data.success) {
      throw new Error(response.data.message || "Transaction creation failed");
    }

    console.log(
      `[TRIPAY] Transaction created successfully: ${response.data.data.reference}`
    );
    return response.data.data;
  } catch (error) {
    console.error(
      "[TRIPAY ERROR] Create transaction:",
      error.response?.data || error.message
    );

    const errorResponse = error.response?.data;
    const errorMessage = errorResponse?.message || error.message;
    const errorDetail = errorResponse?.data
      ? JSON.stringify(errorResponse.data)
      : "";

    throw new Error(
      `Failed to create payment transaction: ${errorMessage} ${errorDetail}`
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
      }
    );

    if (!response.data.success) {
      throw new Error(
        response.data.message || "Failed to get transaction details"
      );
    }

    return response.data.data;
  } catch (error) {
    console.error(
      "[TRIPAY ERROR] Get transaction details:",
      error.response?.data || error.message
    );
    throw new Error(
      "Failed to get transaction details: " +
        (error.response?.data?.message || error.message)
    );
  }
};

/**
 * Verify callback signature from Tripay with enhanced security
 * (Legacy function wrapping the header verification logic)
 * @param {Object} callbackData - Callback data from Tripay
 * @returns {Boolean} Whether the signature is valid
 */
export const verifyCallbackSignature = (callbackData) => {
  // Jika signature ada di body (jarang terjadi di update baru Tripay), gunakan itu
  // Jika tidak, logic ini biasanya dipanggil dengan signature dari header di controller
  const signature = callbackData.signature || "";
  return verifyCallbackSignatureFromHeader(signature, callbackData);
};

// Test function untuk development
export const testTripayConnection = async () => {
  try {
    console.log("[TRIPAY TEST] Testing connection...");
    const channels = await getPaymentChannels();
    console.log("[TRIPAY TEST] Connection successful!");
    return true;
  } catch (error) {
    console.error("[TRIPAY TEST] Connection failed:", error.message);
    return false;
  }
};

/**
 * Validasi Signature dari HEADER (Metode Utama Tripay saat ini)
 * Menggunakan TRIPAY_PRIVATE_KEY yang sudah di-TRIM di atas.
 */
export const verifyCallbackSignatureFromHeader = (
  headerSignature,
  callbackData
) => {
  try {
    validateConfig();

    const { merchant_ref, reference, status } = callbackData;

    if (!merchant_ref || !reference || !status || !headerSignature) {
      console.error(
        "[TRIPAY CALLBACK] Missing data for header signature verification"
      );
      return false;
    }

    const signatureString = `${merchant_ref}${reference}${status}`;

    // TRIPAY_PRIVATE_KEY di sini mengacu pada variabel global di atas yang sudah di-.trim()
    const validSignature = crypto
      .createHmac("sha256", TRIPAY_PRIVATE_KEY)
      .update(signatureString)
      .digest("hex");

    const isValid = headerSignature === validSignature;

    if (!isValid) {
      console.error(`[TRIPAY VALIDATION FAIL]`);
      console.error(`-- Expected: ${validSignature}`);
      console.error(`-- Received: ${headerSignature}`);
      // Log ini membantu memastikan apakah data inputnya yang beda
      console.error(`-- Data String: ${signatureString}`);
    } else {
      console.log(`[TRIPAY VALIDATION] Signature Valid for ${reference}`);
    }

    return isValid;
  } catch (error) {
    console.error("[TRIPAY ERROR] Verify header signature:", error.message);
    return false;
  }
};
