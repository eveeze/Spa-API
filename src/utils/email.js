// src/utils/email.js

import nodemailer from "nodemailer";
import fs from "fs";
import path, { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

/**
 * Fungsi baru yang lebih generik untuk mengirim email.
 * @param {string} to - Alamat email tujuan
 * @param {string} subject - Judul email
 * @param {string} html - Konten email dalam format HTML
 */
export const sendEmail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: `Ema Mom Kids Baby Spa <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email dengan subjek "${subject}" berhasil dikirim ke ${to}`);
  } catch (error) {
    console.error(`Error saat mengirimkan email ke ${to}: `, error);
    throw error;
  }
};

// Fungsi generateOTP tetap sama
export const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Fungsi sendOtp sekarang bisa menggunakan fungsi sendEmail yang baru
export const sendOtp = async (email, otp) => {
  const templatePath = join(__dirname, "email.html");
  let htmlTemplate = fs.readFileSync(templatePath, "utf8");
  htmlTemplate = htmlTemplate.replace("{{OTP}}", otp);

  // Menggunakan fungsi generik sendEmail
  await sendEmail(email, "Verifikasi OTP", htmlTemplate);
};

// Pastikan transporter juga diekspor jika masih dibutuhkan di tempat lain
export { transporter };
