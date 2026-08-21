import {
  Module,
} from '@nestjs/common';

import {
  PurchaseOrderController,
} from './controllers/purchase-order.controller';

import {
  PurchaseOrderRepository,
} from './repositories/purchase-order.repository';

import {
  PurchaseOrderService,
} from './services/purchase-order.service';

@Module({
  controllers: [
    PurchaseOrderController,
  ],

  providers: [
    PurchaseOrderRepository,
    PurchaseOrderService,
  ],

  exports: [
    PurchaseOrderService,
  ],
})
export class PurchaseOrderModule {}