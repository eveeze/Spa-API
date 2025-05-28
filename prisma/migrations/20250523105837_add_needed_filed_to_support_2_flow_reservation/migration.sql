-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'CASH';
ALTER TYPE "PaymentMethod" ADD VALUE 'MANUAL';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "address" TEXT,
ADD COLUMN     "instagramHandle" TEXT,
ADD COLUMN     "isManualCustomer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "notes" TEXT;
