// middlewares/imageUploadMiddleware.js
import {
  uploadStaffProfile,
  uploadServiceImage,
  uploadPaymentProof,
  deleteImage,
} from "../utils/cloudinary.js";

// Middleware for handling staff profile picture uploads
const staffProfileUploadMiddleware = (req, res, next) => {
  const upload = uploadStaffProfile.single("profilePicture");

  upload(req, res, function (error) {
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Error uploading file: " + error.message,
      });
    }

    if (req.file) {
      req.profilePictureUrl = req.file.path;
    }

    next();
  });
};

const serviceImageUploadMiddleware = (req, res, next) => {
  const upload = uploadServiceImage.single("imageUrl");

  upload(req, res, function (error) {
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Error uploading file: " + error.message,
      });
    }

    if (req.file) {
      req.serviceImageUrl = req.file.path;
    }

    next();
  });
};

const paymentProofUploadMiddleware = (req, res, next) => {
  const upload = uploadPaymentProof.single("paymentProof");

  upload(req, res, function (error) {
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Error uploading file: " + error.message,
      });
    }

    // Add payment proof URL to request if file was uploaded
    if (req.file) {
      req.paymentProofUrl = req.file.path;
    }

    next();
  });
};

export {
  staffProfileUploadMiddleware,
  serviceImageUploadMiddleware,
  paymentProofUploadMiddleware,
};
