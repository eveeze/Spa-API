import prisma from "../config/db.js";

export const findOwnerByEmail = async (email) => {
  const owner = await prisma.owner.findUnique({
    where: { email },
  });

  return owner;
};
