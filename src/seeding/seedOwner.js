// src/seeding/seedOwner.js
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import prisma from "../config/db.js";

dotenv.config();

const seedOwner = async () => {
  try {
    const salt = parseInt(process.env.SALT || 10);
    const dataOwner = {
      name: "Ema Pradina",
      email: "emamomkidsbabyspa98@gmail.com",
      password: await bcrypt.hash("1234567890", salt),
      phoneNumber: "085848110489",
    };
    const owner = await prisma.owner.create({
      data: dataOwner,
    });

    console.log("Owner berhasil ditambahkan : ", owner);
  } catch (err) {
    console.error("terjadi kesalahan saat seeding owner", err);
  } finally {
    await prisma.$disconnect();
  }
};

seedOwner();
