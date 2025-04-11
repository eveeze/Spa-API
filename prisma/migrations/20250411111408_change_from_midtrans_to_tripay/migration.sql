/*
  Warnings:

  - You are about to drop the column `midtransPaymentUrl` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `midtransResponse` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `snapToken` on the `Payment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "midtransPaymentUrl",
DROP COLUMN "midtransResponse",
DROP COLUMN "snapToken",
ADD COLUMN     "tripayInstructions" JSONB,
ADD COLUMN     "tripayPaymentUrl" TEXT,
ADD COLUMN     "tripayResponse" JSONB,
ADD COLUMN     "tripayToken" TEXT;
