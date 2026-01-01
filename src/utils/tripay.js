// utils/tripay.js
import axios from "axios";
import crypto from "crypto";

// Tripay API configuration
const TRIPAY_MODE = process.env.TRIPAY_MODE || "sandbox";
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;

// PERBAIKAN 1: Tambahkan .trim() di sini agar Private Key bersih dari spasi/enter
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
};

/**
 * Get available payment channels from Tripay with retry logic
 * (FUNGSI INI TETAP UTUH)
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
        timeout: 10000,
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
 * Calculate signature for Tripay transaction (Creation)
 * (FUNGSI INI TETAP UTUH)
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
 * (FUNGSI INI TETAP UTUH)
 */
export const createTransaction = async (paymentData) => {
  validateConfig();

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

    const currentTime = Math.floor(Date.now() / 1000);
    const expiryTime = currentTime + 24 * 60 * 60;
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
        timeout: 15000,
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
 * (FUNGSI INI TETAP UTUH)
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
        timeout: 10000,
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
 * PERBAIKAN 2: FUNGSI VERIFIKASI SESUAI DOKUMENTASI
 * Menggunakan req.rawBody dan req.headers
 * (Menggantikan verifyCallbackSignature lama & verifyCallbackSignatureFromHeader)
 */
export const verifyCallbackSignature = (req) => {
  try {
    validateConfig();

    // 1. Ambil Signature dari Header
    const signatureFromHeader = req.headers["x-callback-signature"];

    // 2. Ambil RAW BODY (String JSON asli)
    // Pastikan app.js sudah dikonfigurasi untuk menangkap rawBody!
    const rawBody = req.rawBody;

    if (!signatureFromHeader) {
      console.error("[TRIPAY] Missing X-Callback-Signature header");
      return false;
    }

    if (!rawBody) {
      console.error(
        "[TRIPAY] Raw body is missing. Please check app.js configuration."
      );
      return false;
    }

    // 3. Generate Signature: HMAC-SHA256(Raw JSON Body, Private Key)
    // Private Key sudah di-trim di bagian atas file
    const calculatedSignature = crypto
      .createHmac("sha256", TRIPAY_PRIVATE_KEY)
      .update(rawBody)
      .digest("hex");

    const isValid = signatureFromHeader === calculatedSignature;

    if (!isValid) {
      console.error(`[TRIPAY VALIDATION FAIL]`);
      console.error(`-- Header: ${signatureFromHeader}`);
      console.error(`-- Calculated: ${calculatedSignature}`);
    } else {
      console.log(`[TRIPAY VALIDATION] Signature Valid!`);
    }

    return isValid;
  } catch (error) {
    console.error("[TRIPAY ERROR] Verify signature:", error.message);
    return false;
  }
};

/**
 * Test function untuk development
 * (FUNGSI INI TETAP UTUH)
 */
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
