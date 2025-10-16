// customerRepository.js
//  is a file responsible for handling all the database operations related to the customer entity.

import prisma from "../config/db.js";

export const findPelangganByEmail = async (email) => {
  const customer = await prisma.customer.findUnique({
    where: { email },
  });
  return customer;
};
export const findPelangganByPhoneNumber = async (phoneNumber) => {
  const customer = await prisma.customer.findUnique({
    where: { phoneNumber },
  });
  return customer;
};

export const findPelangganById = async (id) => {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      isVerified: true,
      createdAt: true,
    },
  });

  return customer;
};

export const updatePelanggan = async (id, data) => {
  const customer = await prisma.customer.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      isVerified: true,
      createdAt: true,
    },
  });
  return customer;
};

export const findAllPelanggan = async () => {
  const customer = await prisma.customer.findMany();
  return customer;
};
