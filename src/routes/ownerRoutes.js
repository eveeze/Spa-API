import express from "express";
import ownerController from "../controller/ownerController.js";
import { ownerAuth, errorHandler } from "../middlewares/authMiddleware.js";
const router = express.Router();

// Public routes
router.post("/login", ownerController.ownerLogin);

// Protected routes
router.use(ownerAuth); // Middleware berlaku untuk semua route di bawah ini

router.get("/profile", ownerController.getOwnerProfile);
router.post("/update-player-id", ownerController.updatePlayerIdHandler);

router.use(errorHandler);

export default router;
