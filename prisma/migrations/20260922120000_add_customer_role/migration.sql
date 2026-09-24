-- Login do cliente: o CUSTOMER enxerga as próprias OS e orçamentos e responde
-- ao orçamento.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CUSTOMER';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "clientId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "user_clientId_key" ON "user"("clientId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Todo CUSTOMER tem cliente, e só o CUSTOMER tem. A comparação é em texto
-- porque o valor novo do enum não pode ser usado na mesma transação em que
-- foi criado.
ALTER TABLE "user"
  ADD CONSTRAINT "user_customer_client_check"
  CHECK (("role"::text = 'CUSTOMER') = ("clientId" IS NOT NULL));
