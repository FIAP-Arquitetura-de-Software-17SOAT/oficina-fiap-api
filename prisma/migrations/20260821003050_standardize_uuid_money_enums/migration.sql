-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('NEEDS_PURCHASE', 'AWAITING_DELIVERY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('RECEIVED', 'IN_DIAGNOSIS', 'AWAITING_APPROVAL', 'AWAITING_PARTS', 'IN_PROGRESS', 'COMPLETED', 'DELIVERED', 'CANCELLED');

-- Existing Budget.serviceOrderId intentionally remains TEXT and external to
-- ServiceOrder for the Budget MVP. Do not add a foreign key here.

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
ALTER TABLE "user"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid;

-- AlterTable
ALTER TABLE "refresh_session"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "userId" TYPE UUID USING "userId"::uuid;

-- AlterTable
ALTER TABLE "client"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid;

-- AlterTable
ALTER TABLE "vehicle"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "clientId" TYPE UUID USING "clientId"::uuid;

-- AlterTable
ALTER TABLE "service_order"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "clientId" TYPE UUID USING "clientId"::uuid,
  ALTER COLUMN "vehicleId" TYPE UUID USING "vehicleId"::uuid,
  ALTER COLUMN "status" TYPE "ServiceOrderStatus" USING "status"::"ServiceOrderStatus";

-- AlterTable
ALTER TABLE "purchase_order"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "status" TYPE "PurchaseOrderStatus" USING "status"::"PurchaseOrderStatus";

-- AlterTable
ALTER TABLE "purchase_order_item"
  RENAME COLUMN "pecaId" TO "partId";

-- AlterTable
ALTER TABLE "purchase_order_item"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "purchaseOrderId" TYPE UUID USING "purchaseOrderId"::uuid,
  ALTER COLUMN "partId" TYPE UUID USING "partId"::uuid;

-- AlterTable
ALTER TABLE "budget"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ADD COLUMN "totalCents" INTEGER;

-- Backfill
UPDATE "budget"
SET "totalCents" = ROUND("totalAmount" * 100)::integer;

-- AlterTable
ALTER TABLE "budget"
  ALTER COLUMN "totalCents" SET NOT NULL,
  DROP COLUMN "totalAmount";

-- AlterTable
ALTER TABLE "budget_item"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "budgetId" TYPE UUID USING "budgetId"::uuid,
  ADD COLUMN "unitPriceCents" INTEGER,
  ADD COLUMN "subtotalCents" INTEGER;

-- Backfill
UPDATE "budget_item"
SET
  "unitPriceCents" = ROUND("unitPrice" * 100)::integer,
  "subtotalCents" = ROUND("subtotal" * 100)::integer;

-- AlterTable
ALTER TABLE "budget_item"
  ALTER COLUMN "unitPriceCents" SET NOT NULL,
  ALTER COLUMN "subtotalCents" SET NOT NULL,
  DROP COLUMN "unitPrice",
  DROP COLUMN "subtotal";

-- CreateIndex
CREATE INDEX "service_order_vehicleId_idx" ON "service_order"("vehicleId");

-- AddForeignKey
ALTER TABLE "refresh_session" ADD CONSTRAINT "refresh_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_item" ADD CONSTRAINT "budget_item_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
