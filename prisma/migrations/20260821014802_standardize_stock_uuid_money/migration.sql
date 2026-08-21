/*
  Warnings:

  - The primary key for the `part` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `unitPrice` on the `part` table. All the data in the column will be lost.
  - The primary key for the `stock_movement` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `unitPriceCents` to the `part` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `id` on the `part` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `stock_movement` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `partId` on the `stock_movement` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_partId_fkey";

-- AlterTable
ALTER TABLE "part" DROP CONSTRAINT "part_pkey",
DROP COLUMN "unitPrice",
ADD COLUMN     "unitPriceCents" INTEGER NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "part_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "partId",
ADD COLUMN     "partId" UUID NOT NULL,
ADD CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "stock_movement_partId_idx" ON "stock_movement"("partId");

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
