// customerController.js

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  findAllPelanggan,
  findPelangganByEmail,
  findPelangganByPhoneNumber,
  findPelangganById,
  updatePelanggan,
} from "../repository/customerRepository.js";
import { generateOTP, sendOtp, sendEmailWithTemplate } from "../utils/email.js";
import prisma from "../config/db.js";
const register = async (req, res) => {
  try {
    const { name, email, phoneNumber, password } = req.body;

    // 1. Cek apakah email sudah terdaftar sebagai akun online penuh
    const customerByEmail = await findPelangganByEmail(email);
    if (
      customerByEmail &&
      customerByEmail.isVerified &&
      !customerByEmail.isManualCustomer
    ) {
      return res.status(400).json({ message: "Email sudah terdaftar." });
    }

    // 2. Cek apakah nomor telepon sudah terdaftar
    const customerByPhone = await findPelangganByPhoneNumber(phoneNumber);

    const salt = parseInt(process.env.SALT);
    const hashedPassword = await bcrypt.hash(password, salt);
    const otp = generateOTP();

    // 3. Terapkan Logika Percabangan (inti dari solusi)

    // SKENARIO A: Klaim Akun (Nomor HP ada & statusnya manual)
    if (customerByPhone && customerByPhone.isManualCustomer) {
      const activatedCustomer = await prisma.customer.update({
        where: { id: customerByPhone.id },
        data: {
          name,
          email, // Update email dummy dengan email asli
          password: hashedPassword, // Update password dummy dengan password baru
          isManualCustomer: false, // Ubah jadi akun online
          isVerified: false, // Wajibkan verifikasi email baru
          verificationOtp: otp,
          verificationOtpCreatedAt: new Date(),
        },
      });

      await sendOtp(email, otp); // Kirim OTP ke email BARU

      return res.status(200).json({
        customer: activatedCustomer,
        message:
          "Akun manual ditemukan. Silakan verifikasi email Anda untuk mengaktifkan akun.",
      });
    }

    // SKENARIO B: Nomor HP sudah terdaftar sebagai akun online
    else if (customerByPhone && !customerByPhone.isManualCustomer) {
      return res.status(400).json({
        message:
          "Nomor telepon sudah terdaftar. Silakan login atau gunakan fitur Lupa Password.",
      });
    }

    // SKENARIO C: Pendaftaran baru (email dan nomor HP belum ada)
    else {
      const newCustomer = await prisma.customer.create({
        data: {
          name,
          email,
          phoneNumber,
          password: hashedPassword,
          verificationOtp: otp,
          verificationOtpCreatedAt: new Date(),
        },
      });

      await sendOtp(email, otp);

      return res.status(201).json({
        customer: newCustomer,
        message:
          "Pendaftaran berhasil. Silakan cek email Anda untuk verifikasi OTP.",
      });
    }
  } catch (err) {
    if (err.code === "P2002") {
      return res
        .status(400)
        .json({ message: "Email atau Nomor Telepon sudah digunakan." });
    }
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
    const customer = await findPelangganByEmail(email);
    if (!customer) {
      return res.status(404).json({ message: "Email tidak ditemukan" });
    }
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

    // Panggilan ini juga sudah benar dan tidak perlu diubah
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
      { expiresIn: "24h" }
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

    const otp = generateOTP();

    await prisma.customer.update({
      where: { email },
      data: {
        resetPasswordOtp: otp,
        resetOtpCreatedAt: new Date(),
        isResetPasswordVerified: false,
      },
    });

    // Ganti pemanggilan `sendOtp` dengan `sendEmailWithTemplate`
    await sendEmailWithTemplate(
      email,
      "OTP Reset Password",
      "resetPassword", // Gunakan template baru
      {
        customerName: customer.name,
        OTP: otp,
      }
    );

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

const updatePlayerIdHandler = async (req, res) => {
  // Ambil playerId dari body request yang dikirim frontend
  const { playerId } = req.body;
  // Ambil ID customer dari token JWT yang sudah diverifikasi oleh middleware `customerAuth`
  const { id: customerId } = req.customer;

  if (!playerId) {
    return res
      .status(400)
      .json({ success: false, message: "Player ID wajib diisi." });
  }

  try {
    // Update data customer di database dengan playerId yang baru
    await prisma.customer.update({
      where: {
        id: customerId,
      },
      data: {
        oneSignalPlayerId: playerId,
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Player ID berhasil diperbarui." });
  } catch (error) {
    console.error("[UPDATE_PLAYER_ID_ERROR]:", error);
    return res
      .status(500)
      .json({ success: false, message: "Gagal memperbarui Player ID." });
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
  updatePlayerIdHandler,
};

export default customerController;
