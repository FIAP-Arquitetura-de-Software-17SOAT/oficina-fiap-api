-- Serviços e peças que o cliente pede ao abrir a OS. É pedido, sem preço: o
-- orçamento continua sendo gerado depois do diagnóstico.

-- CreateEnum
CREATE TYPE "ServiceOrderRequestedItemType" AS ENUM ('SERVICE', 'PART');

-- CreateTable
CREATE TABLE "service_order_requested_item" (
    "id" UUID NOT NULL,
    "serviceOrderId" UUID NOT NULL,
    "type" "ServiceOrderRequestedItemType" NOT NULL,
    "serviceId" UUID,
    "partId" UUID,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "service_order_requested_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_order_requested_item_serviceId_idx" ON "service_order_requested_item"("serviceId");

-- CreateIndex
CREATE INDEX "service_order_requested_item_partId_idx" ON "service_order_requested_item"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "service_order_requested_item_serviceOrderId_serviceId_key" ON "service_order_requested_item"("serviceOrderId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "service_order_requested_item_serviceOrderId_partId_key" ON "service_order_requested_item"("serviceOrderId", "partId");

-- AddForeignKey
ALTER TABLE "service_order_requested_item" ADD CONSTRAINT "service_order_requested_item_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_requested_item" ADD CONSTRAINT "service_order_requested_item_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_requested_item" ADD CONSTRAINT "service_order_requested_item_partId_fkey" FOREIGN KEY ("partId") REFERENCES "part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Exatamente uma referência, conforme o tipo. Mesma regra da entidade.
ALTER TABLE "service_order_requested_item"
  ADD CONSTRAINT "service_order_requested_item_reference_check"
  CHECK (
    ("type"::text = 'SERVICE' AND "serviceId" IS NOT NULL AND "partId" IS NULL)
    OR ("type"::text = 'PART' AND "partId" IS NOT NULL AND "serviceId" IS NULL)
  );

-- Pedir nada não é pedido (regra 17).
ALTER TABLE "service_order_requested_item"
  ADD CONSTRAINT "service_order_requested_item_quantity_check"
  CHECK ("quantity" > 0);
