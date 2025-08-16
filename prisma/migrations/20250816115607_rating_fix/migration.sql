/*
  Warnings:

  - You are about to drop the column `customerId` on the `Rating` table. All the data in the column will be lost.
  - You are about to drop the column `serviceId` on the `Rating` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_serviceId_fkey";

-- AlterTable
ALTER TABLE "Rating" DROP COLUMN "customerId",
DROP COLUMN "serviceId";

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "ratingTokenExpiresAt" TIMESTAMP(3),
ALTER COLUMN "ratingToken" DROP NOT NULL;
