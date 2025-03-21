-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "priceTierId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "hasPriceTiers" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "minBabyAge" DROP NOT NULL,
ALTER COLUMN "maxBabyAge" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tierName" TEXT NOT NULL,
    "minBabyAge" INTEGER NOT NULL,
    "maxBabyAge" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_serviceId_minBabyAge_maxBabyAge_key" ON "PriceTier"("serviceId", "minBabyAge", "maxBabyAge");

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
