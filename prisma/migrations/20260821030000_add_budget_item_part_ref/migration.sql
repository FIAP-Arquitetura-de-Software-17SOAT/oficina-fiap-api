-- Referência da peça no item de orçamento (o `referenciaId` do modelo de domínio).
-- É o que permite a política "orçamento aceito -> peças e insumos são solicitados"
-- saber qual peça baixar. Nulo em itens do tipo SERVICE, que não têm peça.
ALTER TABLE "budget_item" ADD COLUMN "partId" UUID;

CREATE INDEX "budget_item_partId_idx" ON "budget_item"("partId");

ALTER TABLE "budget_item"
  ADD CONSTRAINT "budget_item_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "part"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
