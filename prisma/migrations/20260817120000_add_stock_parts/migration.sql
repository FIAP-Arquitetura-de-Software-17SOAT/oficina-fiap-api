-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EMPLOYEE';

-- CreateEnum
CREATE TYPE "PartType" AS ENUM ('PART', 'SUPPLY');

-- CreateEnum
CREATE TYPE "MeasurementUnit" AS ENUM ('UNIT', 'LITER', 'KILOGRAM');

-- CreateTable
CREATE TABLE "part" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PartType" NOT NULL,
    "unit" "MeasurementUnit" NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "minimumQuantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "part_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "part_code_key" ON "part"("code");
