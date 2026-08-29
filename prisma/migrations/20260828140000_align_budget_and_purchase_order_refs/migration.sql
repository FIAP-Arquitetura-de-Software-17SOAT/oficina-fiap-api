BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Orçamento -> Ordem de Serviço
--
-- `budget.serviceOrderId` nasceu como TEXT porque, no MVP, o orçamento tratava
-- a OS como referência externa: a entidade carregava um TODO dizendo isso e a
-- migration 20260822010000_align_billing_gateway derrubou a FK justamente para
-- normalizar as duas histórias possíveis do MVP.
--
-- A OS deixou de ser externa: o serviço do orçamento já chama o controller dela
-- para mover o status. Sem a FK, o orçamento é o único id de agregado do schema
-- que pode apontar para uma OS que não existe, e o §5 diz o contrário — uma OS
-- possui várias versões de orçamento.
-- ---------------------------------------------------------------------------

-- Aborta com mensagem de negócio em vez de estourar um erro de cast no meio da
-- migração. Linha que não é UUID é resquício de dado de MVP e precisa ser
-- reconciliada à mão antes de subir a restrição.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "budget"
    WHERE "serviceOrderId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION
      'Nao foi possivel vincular orcamento a ordem de servico: existe budget.serviceOrderId que nao e UUID e precisa de reconciliacao manual';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "budget"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "service_order"
      WHERE "service_order"."id" = "budget"."serviceOrderId"::uuid
    )
  ) THEN
    RAISE EXCEPTION
      'Nao foi possivel vincular orcamento a ordem de servico: existe orcamento apontando para OS inexistente';
  END IF;
END $$;

-- USING, e não DROP/ADD COLUMN: recriar a coluna descartaria o vínculo de todos
-- os orçamentos já emitidos.
ALTER TABLE "budget"
  ALTER COLUMN "serviceOrderId" TYPE UUID
  USING "serviceOrderId"::uuid;

-- Restrict: apagar uma OS que já tem orçamento deve falhar, e não levar a
-- proposta acordada com o cliente junto.
ALTER TABLE "budget"
  ADD CONSTRAINT "budget_serviceOrderId_fkey"
  FOREIGN KEY ("serviceOrderId") REFERENCES "service_order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Item do Pedido de Compra -> Peça
--
-- `stock_movement` e `budget_item` já referenciam `part`. O item do pedido de
-- compra era o único que guardava o partId solto, apesar de o §5 descrever o
-- item como "peça, quantidade e preço unitário copiado no momento da compra".
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "purchase_order_item"
    WHERE NOT EXISTS (
      SELECT 1 FROM "part" WHERE "part"."id" = "purchase_order_item"."partId"
    )
  ) THEN
    RAISE EXCEPTION
      'Nao foi possivel vincular item de pedido de compra a peca: existe item apontando para peca inexistente';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "purchase_order_item_purchaseOrderId_idx"
  ON "purchase_order_item"("purchaseOrderId");

CREATE INDEX IF NOT EXISTS "purchase_order_item_partId_idx"
  ON "purchase_order_item"("partId");

-- Restrict: apagar uma peça que ainda aparece em pedido de compra deve falhar,
-- e não deixar o item do pedido apontando para o vazio.
ALTER TABLE "purchase_order_item"
  ADD CONSTRAINT "purchase_order_item_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "part"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
