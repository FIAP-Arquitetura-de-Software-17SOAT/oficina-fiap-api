BEGIN;

-- Item de peça sem `partId` era aceito pela API e só quebrava no despacho do
-- estoque, quando a OS já estava em `Aguardando peças` com o orçamento aceito e
-- não havia peça nenhuma para baixar. O domínio passou a recusar o item, e o
-- banco fecha a porta de vez: `partId` é o que dá sentido ao item de peça, e o
-- item de serviço não tem peça para apontar.
--
-- A regra é a mesma da entidade `BudgetItem`, nas duas direções:
--   type = 'PART'  <-> "partId" IS NOT NULL
--
-- Se houver linha fora da regra a migration aborta em vez de decidir sozinha o
-- que fazer com ela: não dá para adivinhar qual peça o item deveria referenciar,
-- e apagar orçamento do cliente é decisão de quem opera, não da migration.

DO $$
DECLARE
  invalid_items INTEGER;
BEGIN
  SELECT count(*) INTO invalid_items
  FROM "budget_item"
  WHERE ("type"::text = 'PART') <> ("partId" IS NOT NULL);

  IF invalid_items > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce budget item part reference: % budget item(s) violate it. Itens PART sem partId e itens SERVICE com partId precisam ser corrigidos ou removidos antes desta migration.',
      invalid_items;
  END IF;
END
$$;

ALTER TABLE "budget_item"
  ADD CONSTRAINT "budget_item_part_reference_check"
  CHECK (("type"::text = 'PART') = ("partId" IS NOT NULL));

COMMIT;
