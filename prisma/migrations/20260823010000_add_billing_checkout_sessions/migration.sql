BEGIN;

CREATE TABLE "billing_checkout_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billingId" UUID NOT NULL,
    "gatewayTransactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_checkout_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_checkout_session_gatewayTransactionId_key"
  ON "billing_checkout_session"("gatewayTransactionId");
CREATE INDEX "billing_checkout_session_billingId_idx"
  ON "billing_checkout_session"("billingId");

INSERT INTO "billing_checkout_session" ("billingId", "gatewayTransactionId")
SELECT "id", "gatewayTransactionId"
FROM "billing"
WHERE "gatewayTransactionId" IS NOT NULL;

ALTER TABLE "billing_checkout_session"
  ADD CONSTRAINT "billing_checkout_session_billingId_fkey"
  FOREIGN KEY ("billingId") REFERENCES "billing"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing"
  ADD CONSTRAINT "billing_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "budget"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
