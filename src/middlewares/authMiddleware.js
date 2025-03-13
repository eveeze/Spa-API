// middleware/authMiddleware.js
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
