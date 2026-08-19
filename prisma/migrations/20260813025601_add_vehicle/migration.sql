-- CreateTable
CREATE TABLE "vehicle" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_plate_key" ON "vehicle"("plate");

-- CreateIndex
CREATE INDEX "vehicle_clientId_idx" ON "vehicle"("clientId");

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
