import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { findOwnerByEmail } from "../repository/ownerRepository.js";
const ownerLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Cari owner berdasarkan email
    const owner = await findOwnerByEmail(email);
    if (!owner) {
      return res.status(404).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Verifikasi password
    const isPasswordValid = await bcrypt.compare(password, owner.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: owner.id,
        role: "owner",
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    const responseData = {
      id: owner.id,
      email: owner.email,
      name: owner.name,
      phoneNumber: owner.phoneNumber,
    };

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      owner: responseData,
    });
  } catch (err) {
    console.error("[OWNER LOGIN ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const getOwnerProfile = async (req, res) => {
  try {
    // Data owner sudah tersedia dari middleware
    const owner = req.owner;

    res.status(200).json({
      success: true,
      data: owner,
    });
  } catch (err) {
    console.error("[GET OWNER PROFILE ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export default {
  ownerLogin,
  getOwnerProfile,
};
