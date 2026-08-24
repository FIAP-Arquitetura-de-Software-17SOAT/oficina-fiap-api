BEGIN;

ALTER TABLE "billing_checkout_session"
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "paidAt" TIMESTAMP(3);

UPDATE "billing_checkout_session" AS session
SET
  "paymentMethod" = billing."paymentMethod",
  "paidAt" = billing."paidAt"
FROM "billing" AS billing
WHERE session."billingId" = billing."id"
  AND session."gatewayTransactionId" = billing."gatewayTransactionId"
  AND billing."status" = 'PAID'
  AND session."paidAt" IS NULL;

COMMIT;
