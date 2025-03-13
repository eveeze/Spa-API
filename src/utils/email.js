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

const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const sendOtp = async (email, otp) => {
  try {
    const templatePath = join(__dirname, "email.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");
    htmlTemplate = htmlTemplate.replace("{{OTP}}", otp);

    const mailOptions = {
      from: `Ema Mom Kids Baby Spa <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verifikasi OTP",
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP dikirimkan ke email ${email}`);
  } catch (error) {
    console.error("Error saat mengirimkan OTP ke email : ", error);
    throw error;
  }
};

export { transporter, generateOTP, sendOtp };
