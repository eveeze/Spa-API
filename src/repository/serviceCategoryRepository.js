// src/repositories/serviceCategoryRepository.js
import prisma from "../config/db.js";

export const findAll = async () => {
  return await prisma.serviceCategory.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });
};

export const findById = async (id) => {
  return await prisma.serviceCategory.findUnique({
    where: { id },
    include: {
      services: true,
    },
  });
};

export const create = async (data) => {
  return await prisma.serviceCategory.create({
    data,
  });
};

export const update = async (id, data) => {
  return await prisma.serviceCategory.update({
    where: { id },
    data,
  });
};

export const remove = async (id) => {
  return await prisma.serviceCategory.delete({
    where: { id },
  });
};
