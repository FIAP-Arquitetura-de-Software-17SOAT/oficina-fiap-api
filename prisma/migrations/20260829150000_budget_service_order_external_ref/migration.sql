BEGIN;

-- Decisão de modelagem do grupo: `Budget.serviceOrderId` volta a ser referência
-- externa, sem chave estrangeira. Orçamento e Ordem de Serviço são agregados
-- distintos, e o desenho de Event Storming os liga por identidade, não por
-- integridade referencial do banco — o mesmo tratamento que a OS dá ao mecânico.
--
-- A migration 20260828140000_align_budget_and_purchase_order_refs havia subido a
-- coluna para UUID e criado a FK. Esta desfaz **apenas essa parte**: a relação
-- purchase_order_item -> part criada lá continua valendo, porque item de pedido
-- e peça vivem no mesmo contexto (Estoque e Compras).
--
-- Sem esta migration o schema.prisma declara TEXT sem FK enquanto o banco fica
-- UUID com FK: o Prisma Client geraria tipos que não batem com a coluna, e a
-- restrição continuaria sendo aplicada em runtime sem estar declarada.

ALTER TABLE "budget"
  DROP CONSTRAINT IF EXISTS "budget_serviceOrderId_fkey";

ALTER TABLE "budget"
  ALTER COLUMN "serviceOrderId" TYPE TEXT
  USING "serviceOrderId"::text;

COMMIT;
