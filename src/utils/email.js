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
 * Merender template HTML dengan data dinamis.
 * @param {string} templateName - Nama file template (tanpa .html).
 * @param {object} data - Objek berisi data untuk menggantikan placeholder.
 * @returns {string} Konten HTML yang sudah dirender.
 */
const renderTemplate = (templateName, data) => {
  // Path menuju folder templates, keluar satu level dari 'utils'
  const templatePath = join(
    __dirname,
    "..",
    "templates",
    `${templateName}.html`
  );
  let html = fs.readFileSync(templatePath, "utf8");

  // Ganti semua placeholder {{key}} dengan value dari objek data
  for (const key in data) {
    const regex = new RegExp(`{{${key}}}`, "g");
    html = html.replace(regex, data[key]);
  }

  return html;
};

/**
 * Fungsi dasar untuk mengirim email.
 * @param {string} to - Alamat email tujuan.
 * @param {string} subject - Judul email.
 * @param {string} html - Konten email dalam format HTML.
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

/**
 * Fungsi baru untuk mengirim email menggunakan template.
 * @param {string} to - Alamat email tujuan.
 * @param {string} subject - Judul email.
 * @param {string} templateName - Nama file template di folder /templates.
 * @param {object} data - Objek data untuk mengisi template.
 */
export const sendEmailWithTemplate = async (
  to,
  subject,
  templateName,
  data
) => {
  const htmlContent = renderTemplate(templateName, data);
  await sendEmail(to, subject, htmlContent);
};

// Fungsi generateOTP tetap sama
export const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Fungsi sendOtp sekarang menggunakan sistem template yang baru
export const sendOtp = async (email, otp) => {
  await sendEmailWithTemplate(email, "Verifikasi OTP", "otpVerification", {
    OTP: otp,
  });
};

// Ekspor transporter jika masih dibutuhkan
export { transporter };
