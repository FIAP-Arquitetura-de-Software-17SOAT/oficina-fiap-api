import { Injectable } from '@nestjs/common';
import { RegisterShortageUseCase } from '../../../purchase-order/application/use-cases/register-shortage.use-case';
import {
  ShortageItem,
  ShortagePurchasePort,
} from '../../application/ports/shortage-purchase.port';

@Injectable()
export class PurchaseOrderAdapter implements ShortagePurchasePort {
  constructor(
    private readonly registerShortageUseCase: RegisterShortageUseCase,
  ) {}

  async registerShortage(items: ShortageItem[]): Promise<{ id: string }> {
    const purchaseOrder = await this.registerShortageUseCase.execute({ items });
    return { id: purchaseOrder.getId() };
  }
}
