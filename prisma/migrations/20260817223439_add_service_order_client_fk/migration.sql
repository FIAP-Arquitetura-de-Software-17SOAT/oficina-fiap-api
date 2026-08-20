-- CreateIndex
CREATE INDEX "service_order_clientId_idx" ON "service_order"("clientId");

-- AddForeignKey
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
