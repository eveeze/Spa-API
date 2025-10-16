/*
  Warnings:

  - A unique constraint covering the columns `[phoneNumber]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Customer_phoneNumber_key" ON "public"."Customer"("phoneNumber");

-- AddForeignKey
ALTER TABLE "public"."Analytics" ADD CONSTRAINT "Analytics_popularServiceId_fkey" FOREIGN KEY ("popularServiceId") REFERENCES "public"."Service"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."Analytics" ADD CONSTRAINT "Analytics_popularStaffId_fkey" FOREIGN KEY ("popularStaffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
