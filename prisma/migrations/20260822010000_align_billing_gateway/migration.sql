BEGIN;

-- Partial legacy payments cannot be represented by the gateway-backed model.
-- Abort before changing enums, dropping columns, or removing the payment ledger.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "billing"
    WHERE "status"::text = 'PARTIALLY_PAID'
       OR ("paidCents" > 0 AND "status"::text <> 'PAID')
  ) THEN
    RAISE EXCEPTION
      'Cannot align billing gateway: partial legacy payments require manual reconciliation';
  END IF;
END $$;

-- Migration history may have converted this Budget MVP external reference to
-- UUID and attached it to ServiceOrder. Normalize both possible histories.
ALTER TABLE "budget"
  DROP CONSTRAINT IF EXISTS "budget_serviceOrderId_fkey";

ALTER TABLE "budget"
  ALTER COLUMN "serviceOrderId" TYPE TEXT
  USING "serviceOrderId"::text;

CREATE TYPE "BillingStatus_new" AS ENUM ('PENDING', 'WAITING_PAYMENT', 'PAID', 'EXPIRED');
CREATE TYPE "PaymentMethod_new" AS ENUM ('PIX', 'CARD', 'CASH');

ALTER TABLE "billing"
  ADD COLUMN "budgetId" UUID,
  ADD COLUMN "amountCents" INTEGER,
  ADD COLUMN "paymentLink" TEXT,
  ADD COLUMN "gatewayTransactionId" TEXT,
  ADD COLUMN "paymentMethod" "PaymentMethod_new",
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

-- Preserve the most recent useful payment metadata for fully paid billings.
UPDATE "billing" AS billing
SET "paymentMethod" = (
      CASE latest_payment."method"::text
        WHEN 'CREDIT_CARD' THEN 'CARD'
        WHEN 'DEBIT_CARD' THEN 'CARD'
        WHEN 'BANK_TRANSFER' THEN 'CARD'
        WHEN 'PIX' THEN 'PIX'
        WHEN 'CASH' THEN 'CASH'
      END
    )::"PaymentMethod_new",
    "paidAt" = latest_payment."paidAt"
FROM (
  SELECT DISTINCT ON ("billingId")
    "billingId",
    "method",
    "paidAt"
  FROM "billing_payment"
  ORDER BY "billingId", "paidAt" DESC, "createdAt" DESC, "id" DESC
) AS latest_payment
WHERE billing."id" = latest_payment."billingId"
  AND billing."status"::text = 'PAID';

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
  ALTER COLUMN "status" TYPE "BillingStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PAID' THEN 'PAID'
      WHEN 'CANCELLED' THEN 'EXPIRED'
      ELSE 'PENDING'
    END
  )::"BillingStatus_new";

-- All legacy payment data needed by the new model has been staged above.
DROP TABLE "billing_payment";

DROP TYPE "BillingStatus";
ALTER TYPE "BillingStatus_new" RENAME TO "BillingStatus";

DROP TYPE "PaymentMethod";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";

ALTER TABLE "billing"
  ALTER COLUMN "budgetId" SET NOT NULL,
  ALTER COLUMN "amountCents" SET NOT NULL,
  DROP COLUMN "totalCents",
  DROP COLUMN "paidCents",
  DROP COLUMN "balanceCents";

CREATE UNIQUE INDEX "billing_gatewayTransactionId_key" ON "billing"("gatewayTransactionId");
CREATE INDEX "billing_budgetId_idx" ON "billing"("budgetId");

COMMIT;
