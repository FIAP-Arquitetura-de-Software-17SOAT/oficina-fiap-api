-- Link de aprovação do orçamento enviado por email: guarda só o hash do token.

-- AlterTable
ALTER TABLE "budget" ADD COLUMN     "approvalTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "approvalTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "budget_approvalTokenHash_key" ON "budget"("approvalTokenHash");

