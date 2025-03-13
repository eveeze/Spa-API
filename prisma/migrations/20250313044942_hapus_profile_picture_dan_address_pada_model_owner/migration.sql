/*
  Warnings:

  - You are about to drop the column `address` on the `Owner` table. All the data in the column will be lost.
  - You are about to drop the column `profilePicture` on the `Owner` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Owner" DROP COLUMN "address",
DROP COLUMN "profilePicture";
