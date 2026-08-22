-- Drop the old child payment ledger. Gateway-backed payment metadata now lives
-- on the billing aggregate row.
DROP TABLE "billing_payment";

-- Replace the legacy billing state set while preserving the closest terminal
-- and non-terminal meanings from existing records.
CREATE TYPE "BillingStatus_new" AS ENUM ('PENDING', 'WAITING_PAYMENT', 'PAID', 'EXPIRED');

ALTER TABLE "billing"
  ALTER COLUMN "status" TYPE "BillingStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PAID' THEN 'PAID'
      WHEN 'CANCELLED' THEN 'EXPIRED'
      ELSE 'PENDING'
    END
  )::"BillingStatus_new";

DROP TYPE "BillingStatus";
ALTER TYPE "BillingStatus_new" RENAME TO "BillingStatus";

DROP TYPE "PaymentMethod";
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CARD', 'CASH');

ALTER TABLE "billing"
  DROP COLUMN "totalCents",
  DROP COLUMN "paidCents",
  DROP COLUMN "balanceCents",
  ADD COLUMN "budgetId" UUID NOT NULL,
  ADD COLUMN "amountCents" INTEGER NOT NULL,
  ADD COLUMN "paymentLink" TEXT,
  ADD COLUMN "gatewayTransactionId" TEXT,
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "billing_gatewayTransactionId_key" ON "billing"("gatewayTransactionId");
CREATE INDEX "billing_budgetId_idx" ON "billing"("budgetId");
