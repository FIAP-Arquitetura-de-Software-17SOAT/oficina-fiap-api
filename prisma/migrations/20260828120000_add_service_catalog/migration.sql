BEGIN;

CREATE TABLE "service" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "service_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_name_key" ON "service"("name");

COMMIT;
