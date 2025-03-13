// customerRoutes.js
import express from "express";
import customerController from "../controller/customerController.js";
import { customerAuth, errorHandler } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", customerController.register);
router.post("/login", customerController.login);

router.post("/verify-otp", customerController.verifyOtp);
router.post("/resend-otp", customerController.resendOtp);
router.post("/forgot-password", customerController.forgotPassword);
router.post("/verify-reset-otp", customerController.verifyResetOtp);
router.post("/reset-password", customerController.resetPassword);

router.use(customerAuth);
router.get("/profile", customerController.getCustomerProfile);

router.use(errorHandler);
export default router;
