-- Atribuicao da OS ao mecanico. A politica do Event Storming diz que atribuir
-- move o status para "em diagnostico" e inicializa o timer, e que o mecanico nao
-- pode pegar outra OS enquanto nao finalizar a atual.
ALTER TABLE "service_order" ADD COLUMN "mechanicId" UUID;
ALTER TABLE "service_order" ADD COLUMN "assignedAt" TIMESTAMP(3);

CREATE INDEX "service_order_mechanicId_idx" ON "service_order"("mechanicId");

-- A exclusividade e uma regra ENTRE instancias: a OS #1 nao conhece a #2, entao
-- nenhuma das duas garante sozinha. So a checagem em codigo deixa passar duas
-- atribuicoes simultaneas; o indice parcial fecha a corrida no banco.
-- Indice parcial nao e expressavel no schema do Prisma, so aqui.
CREATE UNIQUE INDEX "service_order_active_mechanic_key"
  ON "service_order"("mechanicId")
  WHERE "mechanicId" IS NOT NULL
    AND "status" IN (
      'IN_DIAGNOSIS',
      'AWAITING_APPROVAL',
      'AWAITING_PARTS',
      'IN_PROGRESS'
    );
