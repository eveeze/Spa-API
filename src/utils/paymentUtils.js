// utils/paymentUtils.js

/**
 * Format payment method name untuk display
 * @param {string} code - Payment method code
 * @returns {string} Formatted name
 */
export const formatPaymentMethodName = (code) => {
  const methodNames = {
    BRIVA: "BRI Virtual Account",
    BNIVA: "BNI Virtual Account",
    BSIVA: "BSI Virtual Account",
    MANDIRIVA: "Mandiri Virtual Account",
    PERMATAVA: "Permata Virtual Account",
    ALFAMART: "Alfamart",
    ALFAMIDI: "Alfamidi",
    OVO: "OVO",
    DANA: "DANA",
    SHOPEEPAY: "ShopeePay",
    LINKAJA: "LinkAja",
    GOPAY: "GoPay",
    QRIS: "QRIS",
    QRISC: "QRIS Customized",
    QRISCVN: "QRIS CVN",
  };

  return methodNames[code] || code;
};

/**
 * Calculate total fee for payment method
 * @param {number} amount - Base amount
 * @param {number} feeFlat - Flat fee
 * @param {number} feePercent - Percentage fee
 * @returns {object} Fee calculation result
 */
export const calculatePaymentFee = (amount, feeFlat = 0, feePercent = 0) => {
  const percentFee = Math.ceil((amount * feePercent) / 100);
  const totalFee = feeFlat + percentFee;
  const totalAmount = amount + totalFee;

  return {
    baseAmount: amount,
    feeFlat,
    feePercent: percentFee,
    totalFee,
    totalAmount,
  };
};

/**
 * Validate phone number format for Indonesian numbers
 * @param {string} phone - Phone number
 * @returns {string} Cleaned phone number
 */
export const validateAndFormatPhone = (phone) => {
  // Remove all non-digits except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Convert 08xx to 628xx
  if (cleaned.startsWith("08")) {
    cleaned = "628" + cleaned.substring(2);
  }

  // Add +62 if starts with 8
  if (cleaned.startsWith("8")) {
    cleaned = "+628" + cleaned.substring(1);
  }

  // Add + if starts with 62
  if (cleaned.startsWith("62")) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
};

/**
 * Check if payment method supports QR code
 * @param {string} code - Payment method code
 * @returns {boolean} Whether method supports QR
 */
export const supportsQRCode = (code) => {
  const qrMethods = [
    "QRIS",
    "QRISC",
    "QRISCVN",
    "GOPAY",
    "SHOPEEPAY",
    "DANA",
    "LINKAJA",
  ];
  return qrMethods.includes(code);
};

/**
 * Get payment method category
 * @param {string} code - Payment method code
 * @returns {string} Category
 */
export const getPaymentMethodCategory = (code) => {
  if (code.includes("VA")) return "virtual_account";
  if (["OVO", "DANA", "SHOPEEPAY", "LINKAJA", "GOPAY"].includes(code))
    return "e_wallet";
  if (["QRIS", "QRISC", "QRISCVN"].includes(code)) return "qr_code";
  if (["ALFAMART", "ALFAMIDI"].includes(code)) return "convenience_store";
  return "other";
};

/**
 * Format expiry time for display
 * @param {Date} expiryDate - Expiry date
 * @returns {object} Formatted expiry info
 */
export const formatExpiryTime = (expiryDate) => {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) {
    return {
      expired: true,
      timeLeft: "Expired",
      hours: 0,
      minutes: 0,
    };
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return {
    expired: false,
    timeLeft: `${hours}h ${minutes}m`,
    hours,
    minutes,
    totalMinutes: Math.floor(diffMs / (1000 * 60)),
  };
};
