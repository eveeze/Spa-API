// middlewares/authMiddleware.js
import jwt from "jsonwebtoken";
import prisma from "../config/db.js";

export const ownerAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Cek header Authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verifikasi token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cek owner di database
    const owner = await prisma.owner.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
      },
    });

    if (!owner) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Access denied",
      });
    }

    req.owner = owner;
    next();
  } catch (error) {
    // Handle berbagai jenis error JWT
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    console.error("[OWNER AUTH MIDDLEWARE ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const errorHandler = (err, req, res, next) => {
  console.error("[API ERROR]:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};

export const customerAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cek role
    if (decoded.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Invalid access rights",
      });
    }

    // Cek customer di database
    const customer = await prisma.customer.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        isVerified: true,
      },
    });

    if (!customer || !customer.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    req.customer = customer;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    console.error("[OWNER AUTH MIDDLEWARE ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
export const captureRawBodyForCallback = (req, res, next) => {
  if (req.originalUrl.includes("/callback")) {
    let data = "";
    req.setEncoding("utf8");

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      req.rawBody = data;

      // Parse JSON jika belum di-parse
      if (!req.body && data) {
        try {
          req.body = JSON.parse(data);
        } catch (error) {
          console.error("[CALLBACK MIDDLEWARE] JSON parse error:", error);
          return res.status(400).json({
            success: false,
            message: "Invalid JSON format",
          });
        }
      }

      next();
    });

    req.on("error", (error) => {
      console.error("[CALLBACK MIDDLEWARE] Request error:", error);
      res.status(400).json({
        success: false,
        message: "Request processing error",
      });
    });
  } else {
    next();
  }
};

export const callbackMiddleware = (req, res, next) => {
  // Log semua request untuk debugging
  console.log("[CALLBACK MIDDLEWARE] Method:", req.method);
  console.log("[CALLBACK MIDDLEWARE] URL:", req.originalUrl);
  console.log(
    "[CALLBACK MIDDLEWARE] Headers:",
    JSON.stringify(req.headers, null, 2)
  );
  console.log("[CALLBACK MIDDLEWARE] Body:", JSON.stringify(req.body, null, 2));

  // Set CORS headers jika diperlukan
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Callback-Event, X-Callback-Signature"
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Pastikan method adalah POST untuk callback
  if (req.method !== "POST") {
    console.warn(`[CALLBACK MIDDLEWARE] Invalid method: ${req.method}`);
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  // Pastikan content type adalah JSON
  if (
    req.headers["content-type"] &&
    !req.headers["content-type"].includes("application/json")
  ) {
    console.warn(
      "[CALLBACK MIDDLEWARE] Non-JSON content type:",
      req.headers["content-type"]
    );
  }

  // PERBAIKAN: Validasi callback signature dari header jika ada
  if (
    process.env.NODE_ENV === "production" &&
    req.headers["x-callback-signature"]
  ) {
    const receivedSignature = req.headers["x-callback-signature"];

    // Validasi signature menggunakan data dari body
    if (req.body && typeof req.body === "object") {
      const { merchant_ref, reference, status } = req.body;

      if (merchant_ref && reference && status) {
        const calculatedSignature = crypto
          .createHmac("sha256", process.env.TRIPAY_PRIVATE_KEY)
          .update(`${merchant_ref}${reference}${status}`)
          .digest("hex");

        if (receivedSignature !== calculatedSignature) {
          console.error(
            "[CALLBACK MIDDLEWARE] Invalid signature from header:",
            {
              received: receivedSignature,
              calculated: calculatedSignature,
              reference,
            }
          );

          return res.status(400).json({
            success: false,
            message: "Invalid callback signature",
          });
        }

        console.log(
          "[CALLBACK MIDDLEWARE] Valid signature verified from header"
        );
      }
    }
  }

  // Validasi callback event type
  if (
    req.headers["x-callback-event"] &&
    req.headers["x-callback-event"] !== "payment_status"
  ) {
    console.warn(
      `[CALLBACK MIDDLEWARE] Unknown callback event: ${req.headers["x-callback-event"]}`
    );
  }

  next();
};

export const combinedAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Jika tidak ada token, langsung lanjutkan.
    // Controller yang akan memutuskan apakah user wajib login atau tidak.
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cek role dari dalam token
    if (decoded.role === "customer") {
      const customer = await prisma.customer.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, name: true },
      });
      if (customer) {
        req.customer = customer; // Pasang data customer di request
      }
    } else if (decoded.role === "owner") {
      // Asumsi role di token owner adalah 'owner'
      const owner = await prisma.owner.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, name: true },
      });
      if (owner) {
        req.owner = owner; // Pasang data owner di request
      }
    }

    next(); // Lanjutkan ke controller
  } catch (error) {
    // Jika token error (kadaluarsa/invalid), kita tidak stop request,
    // tapi cukup pastikan tidak ada data user yang terpasang.
    // Controller akan menangani jika user tidak ditemukan.
    console.error("[COMBINED AUTH MIDDLEWARE ERROR]:", error.name);
    next();
  }
};
