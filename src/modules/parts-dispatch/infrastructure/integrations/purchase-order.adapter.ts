import { Injectable } from '@nestjs/common';
import { PurchaseOrderService } from '../../../purchase-order/services/purchase-order.service';
import {
  ShortageItem,
  ShortagePurchasePort,
} from '../../application/ports/shortage-purchase.port';

@Injectable()
export class PurchaseOrderAdapter implements ShortagePurchasePort {
  constructor(private readonly purchaseOrders: PurchaseOrderService) {}

  async registerShortage(items: ShortageItem[]): Promise<{ id: string }> {
    const purchaseOrder = await this.purchaseOrders.registerShortage({ items });
    return { id: purchaseOrder.getId() };
  }
}
