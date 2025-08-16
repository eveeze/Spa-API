/*
  Warnings:

  - A unique constraint covering the columns `[reservationId]` on the table `Rating` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ratingToken]` on the table `Reservation` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `reservationId` to the `Rating` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ratingToken` to the `Reservation` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_serviceId_fkey";

-- AlterTable
ALTER TABLE "Rating" ADD COLUMN     "reservationId" TEXT NOT NULL,
ALTER COLUMN "serviceId" DROP NOT NULL,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "ratingToken" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Rating_reservationId_key" ON "Rating"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_ratingToken_key" ON "Reservation"("ratingToken");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
