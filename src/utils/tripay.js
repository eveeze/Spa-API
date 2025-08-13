// utils/tripay.js
import axios from "axios";
import crypto from "crypto";

// Tripay API configuration
const TRIPAY_MODE = process.env.TRIPAY_MODE || "sandbox";
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"; // DIUBAH: Gunakan .env

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

  console.log(`[TRIPAY] Running in ${TRIPAY_MODE} mode`);
  console.log(`[TRIPAY] API URL: ${TRIPAY_API_URL}`);
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
      return_url: return_url, // DIUBAH: Gunakan return_url yang dinamis
      expired_time: expiryTime, // FIXED: Now using timestamp instead of duration
      signature: signature,
    };

    console.log(`[TRIPAY] Creating transaction for ${merchantRef}`);
    console.log(`[TRIPAY] Amount: ${formattedAmount}`);
    console.log(`[TRIPAY] Payment method: ${paymentMethod}`);
    console.log(
      `[TRIPAY] Expiry time: ${expiryTime} (${new Date(
        expiryTime * 1000
      ).toISOString()})`
    );

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

    // Enhanced error message with more details
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
 * @param {Object} callbackData - Callback data from Tripay
 * @returns {Boolean} Whether the signature is valid
 */
export const verifyCallbackSignature = (callbackData) => {
  try {
    validateConfig();

    // PERBAIKAN: Ambil signature dari callbackData atau dari field signature langsung
    const { merchant_ref, reference, status, signature } = callbackData;

    // Validasi required fields are present
    if (!merchant_ref || !reference || !status) {
      console.error(
        "[TRIPAY CALLBACK] Missing required fields for signature verification:",
        {
          merchant_ref: !!merchant_ref,
          reference: !!reference,
          status: !!status,
        }
      );
      return false;
    }

    // PERBAIKAN: Jika tidak ada signature di body, cek dari header (akan dihandle di middleware)
    if (!signature) {
      console.warn("[TRIPAY CALLBACK] No signature in callback data");
      return false;
    }

    // Generate expected signature
    const signatureString = `${merchant_ref}${reference}${status}`;
    const validSignature = crypto
      .createHmac("sha256", TRIPAY_PRIVATE_KEY)
      .update(signatureString)
      .digest("hex");

    const isValid = signature === validSignature;

    // Log verification attempt for security audit
    console.log(`[TRIPAY CALLBACK] Signature verification for ${reference}:`, {
      merchant_ref,
      reference,
      status,
      signatureString,
      receivedSignature: signature,
      calculatedSignature: validSignature,
      isValid,
    });

    if (!isValid) {
      console.error(
        `[TRIPAY CALLBACK] Invalid signature detected for transaction ${reference}:`,
        {
          expected: validSignature,
          received: signature,
          signatureData: signatureString,
        }
      );
    }

    return isValid;
  } catch (error) {
    console.error("[TRIPAY ERROR] Verify callback signature:", error.message);
    return false;
  }
};

// Test function untuk development
export const testTripayConnection = async () => {
  try {
    console.log("[TRIPAY TEST] Testing connection...");
    const channels = await getPaymentChannels();
    console.log("[TRIPAY TEST] Connection successful!");
    console.log(
      "[TRIPAY TEST] Available payment methods:",
      channels.map((c) => c.name)
    );
    return true;
  } catch (error) {
    console.error("[TRIPAY TEST] Connection failed:", error.message);
    return false;
  }
};

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
    const validSignature = crypto
      .createHmac("sha256", TRIPAY_PRIVATE_KEY)
      .update(signatureString)
      .digest("hex");

    const isValid = headerSignature === validSignature;

    console.log(
      `[TRIPAY CALLBACK] Header signature verification for ${reference}:`,
      {
        signatureString,
        headerSignature,
        calculatedSignature: validSignature,
        isValid,
      }
    );

    return isValid;
  } catch (error) {
    console.error("[TRIPAY ERROR] Verify header signature:", error.message);
    return false;
  }
};
