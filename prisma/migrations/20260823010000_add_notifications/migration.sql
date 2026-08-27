BEGIN;

CREATE TYPE "NotificationType" AS ENUM (
  'BUDGET_READY',
  'PAYMENT_LINK_READY',
  'STOCK_PARTS_REQUESTED'
);

CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "notification" (
  "id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "status" "NotificationStatus" NOT NULL,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_status_createdAt_idx"
  ON "notification"("status", "createdAt");

COMMIT;
