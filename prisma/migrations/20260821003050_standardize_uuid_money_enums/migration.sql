/*
  Warnings:

  - The primary key for the `budget` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `totalAmount` on the `budget` table. All the data in the column will be lost.
  - The primary key for the `budget_item` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `subtotal` on the `budget_item` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `budget_item` table. All the data in the column will be lost.
  - The primary key for the `client` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `purchase_order` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `purchase_order_item` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `pecaId` on the `purchase_order_item` table. All the data in the column will be lost.
  - The primary key for the `refresh_session` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `service_order` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `user` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `vehicle` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `totalCents` to the `budget` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `id` on the `budget` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `serviceOrderId` on the `budget` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `subtotalCents` to the `budget_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitPriceCents` to the `budget_item` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `id` on the `budget_item` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `budgetId` on the `budget_item` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `client` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `purchase_order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `purchase_order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `partId` to the `purchase_order_item` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `id` on the `purchase_order_item` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `purchaseOrderId` on the `purchase_order_item` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `refresh_session` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `userId` on the `refresh_session` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `service_order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `clientId` on the `service_order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `vehicleId` on the `service_order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `service_order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `user` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `vehicle` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `clientId` on the `vehicle` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('NEEDS_PURCHASE', 'AWAITING_DELIVERY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('RECEIVED', 'IN_DIAGNOSIS', 'AWAITING_APPROVAL', 'AWAITING_PARTS', 'IN_PROGRESS', 'COMPLETED', 'DELIVERED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "budget_item" DROP CONSTRAINT "budget_item_budgetId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_item" DROP CONSTRAINT "purchase_order_item_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "refresh_session" DROP CONSTRAINT "refresh_session_userId_fkey";

-- DropForeignKey
ALTER TABLE "service_order" DROP CONSTRAINT "service_order_clientId_fkey";

-- DropForeignKey
ALTER TABLE "vehicle" DROP CONSTRAINT "vehicle_clientId_fkey";

-- AlterTable
ALTER TABLE "budget" DROP CONSTRAINT "budget_pkey",
DROP COLUMN "totalAmount",
ADD COLUMN     "totalCents" INTEGER NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "serviceOrderId",
ADD COLUMN     "serviceOrderId" UUID NOT NULL,
ADD CONSTRAINT "budget_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "budget_item" DROP CONSTRAINT "budget_item_pkey",
DROP COLUMN "subtotal",
DROP COLUMN "unitPrice",
ADD COLUMN     "subtotalCents" INTEGER NOT NULL,
ADD COLUMN     "unitPriceCents" INTEGER NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "budgetId",
ADD COLUMN     "budgetId" UUID NOT NULL,
ADD CONSTRAINT "budget_item_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "client" DROP CONSTRAINT "client_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "client_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "purchase_order" DROP CONSTRAINT "purchase_order_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "PurchaseOrderStatus" NOT NULL,
ADD CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "purchase_order_item" DROP CONSTRAINT "purchase_order_item_pkey",
DROP COLUMN "pecaId",
ADD COLUMN     "partId" UUID NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "purchaseOrderId",
ADD COLUMN     "purchaseOrderId" UUID NOT NULL,
ADD CONSTRAINT "purchase_order_item_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "refresh_session" DROP CONSTRAINT "refresh_session_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "refresh_session_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "service_order" DROP CONSTRAINT "service_order_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "clientId",
ADD COLUMN     "clientId" UUID NOT NULL,
DROP COLUMN "vehicleId",
ADD COLUMN     "vehicleId" UUID NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ServiceOrderStatus" NOT NULL,
ADD CONSTRAINT "service_order_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "user" DROP CONSTRAINT "user_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "user_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "vehicle" DROP CONSTRAINT "vehicle_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "clientId",
ADD COLUMN     "clientId" UUID NOT NULL,
ADD CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "budget_serviceOrderId_idx" ON "budget"("serviceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_serviceOrderId_version_key" ON "budget"("serviceOrderId", "version");

-- CreateIndex
CREATE INDEX "refresh_session_userId_idx" ON "refresh_session"("userId");

-- CreateIndex
CREATE INDEX "service_order_clientId_idx" ON "service_order"("clientId");

-- CreateIndex
CREATE INDEX "service_order_vehicleId_idx" ON "service_order"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_clientId_idx" ON "vehicle"("clientId");

-- AddForeignKey
ALTER TABLE "refresh_session" ADD CONSTRAINT "refresh_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_item" ADD CONSTRAINT "budget_item_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
