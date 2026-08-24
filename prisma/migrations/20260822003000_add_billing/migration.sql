-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'BANK_TRANSFER');

-- CreateTable
CREATE TABLE "billing" (
    "id" UUID NOT NULL,
    "serviceOrderId" UUID NOT NULL,
    "status" "BillingStatus" NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_payment" (
    "id" UUID NOT NULL,
    "billingId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_serviceOrderId_key" ON "billing"("serviceOrderId");

-- CreateIndex
CREATE INDEX "billing_status_idx" ON "billing"("status");

-- CreateIndex
CREATE INDEX "billing_payment_billingId_idx" ON "billing_payment"("billingId");

-- AddForeignKey
ALTER TABLE "billing" ADD CONSTRAINT "billing_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payment" ADD CONSTRAINT "billing_payment_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "billing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
