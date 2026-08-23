-- A OS so entra em execucao depois que o estoque registrou que a atendeu.
-- Antes disso dava para marcar o servico como feito sem nenhuma peca ter saido
-- da prateleira, e a OS ainda sumia do relatorio de tempo medio.
ALTER TABLE "service_order" ADD COLUMN "partsDispatchedAt" TIMESTAMP(3);
