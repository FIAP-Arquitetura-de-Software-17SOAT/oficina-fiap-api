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

-- Budget.serviceOrderId has been TEXT with no ServiceOrder foreign key since
-- 20260812120000_add_budget, so it already matches the external-reference
-- Prisma model and needs no database change here.
ALTER TABLE "billing"
  ADD COLUMN "budgetId" UUID,
  ADD COLUMN "amountCents" INTEGER,
  ADD COLUMN "paymentLink" TEXT,
  ADD COLUMN "gatewayTransactionId" TEXT,
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "billing"
SET "amountCents" = "billing"."totalCents";

UPDATE "billing" AS billing
SET "budgetId" = (
  SELECT "budget"."id"
  FROM "budget"
  WHERE "budget"."serviceOrderId" = "billing"."serviceOrderId"::text
    AND "budget"."status" = 'ACCEPTED'
  ORDER BY "budget"."version" DESC
  LIMIT 1
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "billing"
    WHERE "budgetId" IS NULL OR "amountCents" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot align billing gateway: every existing billing requires an accepted budget and total amount';
  END IF;
END $$;

ALTER TABLE "billing"
  ALTER COLUMN "budgetId" SET NOT NULL,
  ALTER COLUMN "amountCents" SET NOT NULL,
  DROP COLUMN "totalCents",
  DROP COLUMN "paidCents",
  DROP COLUMN "balanceCents";

CREATE UNIQUE INDEX "billing_gatewayTransactionId_key" ON "billing"("gatewayTransactionId");
CREATE INDEX "billing_budgetId_idx" ON "billing"("budgetId");
