-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('GENERATED', 'WAITING_APPROVAL', 'ACCEPTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "BudgetItemType" AS ENUM ('SERVICE', 'PART');

-- CreateTable
CREATE TABLE "budget" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BudgetStatus" NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "refusalReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_item" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "BudgetItemType" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "budget_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_serviceOrderId_version_key" ON "budget"("serviceOrderId", "version");

-- CreateIndex
CREATE INDEX "budget_serviceOrderId_idx" ON "budget"("serviceOrderId");

-- AddForeignKey
ALTER TABLE "budget_item" ADD CONSTRAINT "budget_item_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
