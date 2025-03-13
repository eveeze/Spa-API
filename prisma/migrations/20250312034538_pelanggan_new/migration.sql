/*
  Warnings:

  - You are about to drop the column `address` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `babyBirthDate` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `babyGender` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `babyName` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `profilePicture` on the `Customer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "address",
DROP COLUMN "babyBirthDate",
DROP COLUMN "babyGender",
DROP COLUMN "babyName",
DROP COLUMN "profilePicture",
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false;
