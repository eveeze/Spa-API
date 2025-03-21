// customerController.js

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  findAllPelanggan,
  findPelangganByEmail,
  findPelangganById,
  updatePelanggan,
} from "../repository/customerRepository.js";
import { generateOTP, sendOtp } from "../utils/email.js";
import prisma from "../config/db.js";
const register = async (req, res) => {
  try {
    const { name, email, phoneNumber, password } = req.body;
    const cekPelanggan = await findPelangganByEmail(email);
    if (cekPelanggan && cekPelanggan.isVerified) {
      return res.status(400).json({ message: "Email sudah terdaftar" });
    }
    const otp = generateOTP();
    const salt = parseInt(process.env.SALT);
    const hashedPassword = await bcrypt.hash(password, salt);
    const customer = await prisma.customer.upsert({
      where: { email },
      update: {
        name,
        phoneNumber,
        password: hashedPassword,
        verificationOtp: otp,
        verificationOtpCreatedAt: new Date(),
      },
      create: {
        name,
        email,
        phoneNumber,
        password: hashedPassword,
        verificationOtp: otp,
        verificationOtpCreatedAt: new Date(),
      },
    });
    await sendOtp(email, otp);
    return res
      .status(201)
      .json({ customer, message: "Pelanggan berhasil didaftarkan" });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const customer = await findPelangganByEmail(email);

    if (customer.isVerified) {
      return res.status(400).json({ message: "Akun sudah terverifikasi" });
    }
    if (customer.verificationOtp !== otp) {
      return res.status(400).json({ message: "OTP tidak valid" });
    }

    const otpCreatedAt = new Date(customer.verificationOtpCreatedAt);
    const currentTime = new Date();
    const diff = (currentTime - otpCreatedAt) / 60000;

    if (diff > 5) {
      return res.status(400).json({ message: "OTP sudah kadaluarsa" });
    }

    // verif akun customer yang berhasil verif OTP
    await prisma.customer.update({
      where: { email },
      data: {
        isVerified: true,
        verificationOtp: null,
        verificationOtpCreatedAt: null,
      },
    });

    return res.status(200).json({ message: "Akun berhasil diverifikasi" });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Terjadi kesalahan pada server" });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const customer = findPelangganByEmail(email);
    if (customer.isVerified) {
      return res.status(400).json({ message: "Akun sudah terverifikasi" });
    }

    const otp = generateOTP();

    await prisma.customer.update({
      where: { email },
      data: {
        verificationOtp: otp,
        verificationOtpCreatedAt: new Date(),
      },
    });

    await sendOtp(email, otp);
    return res.status(200).json({ message: "OTP berhasil dikirim ulang" });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Terjadi kesalahan pada server" });
  }
};
// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const customer = await findPelangganByEmail(email);
    if (!customer) {
      return res.status(404).json({ message: "Email atau password salah" });
    }

    if (!customer.isVerified) {
      return res.status(400).json({ message: "Akun belum terverifikasi" });
    }

    // Verifikasi password
    const isPasswordValid = await bcrypt.compare(password, customer.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Email atau password salah" });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: customer.id,
        email: customer.email,
        role: "customer",
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    return res.status(200).json({
      message: "Login berhasil",
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
      },
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Forgot Password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const customer = await findPelangganByEmail(email);
    if (!customer) {
      return res.status(404).json({ message: "Email tidak ditemukan" });
    }

    if (!customer.isVerified) {
      return res.status(400).json({ message: "Akun belum terverifikasi" });
    }

    // Generate OTP untuk reset password
    const otp = generateOTP();

    // Update OTP di database
    await prisma.customer.update({
      where: { email },
      data: {
        resetPasswordOtp: otp,
        resetOtpCreatedAt: new Date(),
        isResetPasswordVerified: false,
      },
    });

    // Kirim OTP ke email
    await sendOtp(email, otp, "Reset Password");

    return res
      .status(200)
      .json({ message: "OTP reset password telah dikirim" });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Verify Reset Password OTP
const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const customer = await findPelangganByEmail(email);
    if (!customer) {
      return res.status(404).json({ message: "Email tidak ditemukan" });
    }

    // Cek apakah OTP valid dan belum expired (5 menit)
    if (customer.resetPasswordOtp !== otp) {
      return res.status(400).json({ message: "OTP tidak valid" });
    }

    const otpCreatedAt = new Date(customer.resetOtpCreatedAt);
    const currentTime = new Date();
    const diffInMinutes = (currentTime - otpCreatedAt) / (1000 * 60);

    if (diffInMinutes > 5) {
      return res.status(400).json({ message: "OTP sudah kadaluarsa" });
    }

    // Tandai bahwa OTP reset password sudah diverifikasi
    await prisma.customer.update({
      where: { email },
      data: {
        isResetPasswordVerified: true,
      },
    });

    return res
      .status(200)
      .json({ message: "Verifikasi OTP reset password berhasil" });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    const customer = await findPelangganByEmail(email);
    if (!customer) {
      return res.status(404).json({ message: "Email tidak ditemukan" });
    }

    if (!customer.isResetPasswordVerified) {
      return res
        .status(400)
        .json({ message: "Silakan verifikasi OTP terlebih dahulu" });
    }

    // Hash password baru
    const salt = parseInt(process.env.SALT);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await prisma.customer.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetPasswordOtp: null,
        resetOtpCreatedAt: null,
        isResetPasswordVerified: false,
      },
    });

    return res.status(200).json({ message: "Password berhasil diubah" });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateDataCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phoneNumber, password } = req.body;

    const customer = await findPelangganById(id);
    if (!customer) {
      return res.status(404).json({ message: "Akun tidak ditemukan" });
    }

    const data = { name, phoneNumber };

    if (password) {
      const salt = parseInt(process.env.SALT);
      const hashedPassword = await bcrypt.hash(salt, password);
      data.password = hashedPassword;
    }

    const updatedCustomer = await updatePelanggan(id, data);
    return res.status(200).json({
      messsage: "Berhasil memperbarui data",
      custoemr: updatedCustomer,
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({
      message: "terjadi kesalahan pada server",
    });
  }
};

const getCustomerProfile = async (req, res) => {
  try {
    const { id } = req.customer;
    const customer = await findPelangganById(id);
    if (!customer) {
      return res.status(404).json({ message: "Akun tidak ditemukan" });
    }
    return res.status(200).json(customer);
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getAllCustomer = async (req, res) => {
  try {
    const customer = findAllPelanggan();
    if (!customer) {
      return res.status(404).json({
        message: "Data customer masih kosong",
      });
    }
    return res
      .status(200)
      .json({ message: "berhasil mengambil data csutomer" }, customer);
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({
      message: "terjadi kesalahan pada server",
    });
  }
};
const customerController = {
  register,
  verifyOtp,
  resendOtp,
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  updateDataCustomer,
  getCustomerProfile,
  getAllCustomer,
};

export default customerController;
