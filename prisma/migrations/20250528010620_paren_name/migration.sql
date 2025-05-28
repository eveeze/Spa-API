-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "customerFee" DOUBLE PRECISION,
ADD COLUMN     "merchantFee" DOUBLE PRECISION,
ADD COLUMN     "paymentCodes" JSONB,
ADD COLUMN     "qrCodeUrl" TEXT;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "parentNames" TEXT;
