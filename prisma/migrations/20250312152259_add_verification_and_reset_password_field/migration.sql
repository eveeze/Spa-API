-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "isResetPasswordVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resetOtpCreatedAt" TIMESTAMP(3),
ADD COLUMN     "resetPasswordOtp" TEXT,
ADD COLUMN     "verificationOtp" TEXT,
ADD COLUMN     "verificationOtpCreatedAt" TIMESTAMP(3);
