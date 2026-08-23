-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "partId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_idempotencyKey_key" ON "stock_movement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "stock_movement_partId_idx" ON "stock_movement"("partId");

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "part" ADD CONSTRAINT "part_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "part" ADD CONSTRAINT "part_minimumQuantity_non_negative" CHECK ("minimumQuantity" >= 0);
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_quantity_positive" CHECK ("quantity" > 0);
