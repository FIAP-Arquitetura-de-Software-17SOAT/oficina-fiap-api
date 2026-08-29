BEGIN;

-- Item de orçamento passa a referenciar o serviço do catálogo por identidade,
-- do mesmo jeito que já referencia a peça. Descrição e preço continuam sendo
-- cópia: reajustar o catálogo não pode alterar orçamento já acordado.
--
-- Nulo é permitido: orçamentos criados antes do catálogo continuam válidos, e
-- item de peça nunca aponta para serviço.
ALTER TABLE "budget_item" ADD COLUMN "serviceId" UUID;

CREATE INDEX "budget_item_serviceId_idx" ON "budget_item"("serviceId");

-- Restrict, e não Cascade: apagar um serviço do catálogo não pode apagar item
-- de orçamento já emitido.
ALTER TABLE "budget_item"
  ADD CONSTRAINT "budget_item_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "service"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
