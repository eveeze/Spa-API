// utils/cloudinaryConfig.js
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import path from "path";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create storage engine for staff profile pictures
const staffProfileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "baby-spa/staff-profiles",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 500, height: 500, crop: "limit" }],
  },
});

// Create storage engine for service images
const serviceImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "baby-spa/services",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 800, height: 600, crop: "limit" }],
  },
});

// Create storage engine for payment proofs
const paymentProofStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "baby-spa/payment-proofs",
    allowed_formats: ["jpg", "jpeg", "png", "pdf"],
    resource_type: "auto", // Allow both images and PDFs
  },
});

// File filter function to validate uploaded files
const fileFilter = (req, file, cb) => {
  const allowedFileTypes = ["image/jpeg", "image/jpg", "image/png"];
  if (allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Not an allowed file type. Only JPG, JPEG and PNG are allowed."
      ),
      false
    );
  }
};

// File filter for payment proofs (allows PDF as well)
const paymentProofFileFilter = (req, file, cb) => {
  const allowedFileTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/pdf",
  ];
  if (allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Not an allowed file type. Only JPG, JPEG, PNG and PDF are allowed."
      ),
      false
    );
  }
};

// Create multer upload middleware for staff profile pictures
const uploadStaffProfile = multer({
  storage: staffProfileStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: fileFilter,
});

// Create multer upload middleware for service images
const uploadServiceImage = multer({
  storage: serviceImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter,
});

// Create multer upload middleware for payment proofs
const uploadPaymentProof = multer({
  storage: paymentProofStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: paymentProofFileFilter,
});

// Function to delete image from cloudinary
const deleteImage = async (publicUrl) => {
  try {
    if (!publicUrl)
      return { success: false, message: "No public URL provided" };

    // Extract public ID from the URL
    // Cloudinary URLs typically look like: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/filename.jpg
    const urlParts = publicUrl.split("/");
    const fileName = urlParts[urlParts.length - 1];
    const folderPath = urlParts[urlParts.length - 2];
    const publicId = `${folderPath}/${fileName.split(".")[0]}`;

    const result = await cloudinary.uploader.destroy(publicId);
    return { success: true, result };
  } catch (error) {
    console.error("Error deleting image from Cloudinary:", error);
    return { success: false, error: error.message };
  }
};

export {
  cloudinary,
  uploadStaffProfile,
  uploadServiceImage,
  uploadPaymentProof,
  deleteImage,
};
