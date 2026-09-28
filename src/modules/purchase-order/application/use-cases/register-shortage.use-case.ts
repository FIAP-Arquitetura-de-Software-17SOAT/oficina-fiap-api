import { Quantity } from '../../../../shared/domain/value-objects/quantity.vo';
import { PurchaseOrderItem } from '../../domain/entities/purchase-order-item.entity';
import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderNumber } from '../../domain/value-objects/purchase-order-number.vo';
import { RegisterShortageInput } from '../contracts/purchase-order.input';
import { PurchaseOrderApplicationError } from '../errors/purchase-order-application.error';
import { PartCatalogPort } from '../ports/part-catalog.port';
import { PurchaseOrderRepositoryPort } from '../ports/purchase-order-repository.port';

/**
 * Política do Event Storming: "Quando o estoque for consultado, caso não tenha
 * peças suficientes, o estoquista irá registrar necessidade de compra".
 *
 * O pedido nasce em NEEDS_PURCHASE com o número sequencial do ano e o preço
 * unitário copiado do cadastro da peça — snapshot, como manda o modelo de
 * domínio.
 */
export class RegisterShortageUseCase {
  constructor(
    private readonly purchaseOrders: PurchaseOrderRepositoryPort,
    private readonly catalog: PartCatalogPort,
  ) {}

  async execute(input: RegisterShortageInput): Promise<PurchaseOrder> {
    const purchaseOrder = new PurchaseOrder({
      number: PurchaseOrderNumber.create(await this.nextNumber()),
      supplier: input.supplier?.trim() || 'A definir',
    });

    for (const shortage of input.items) {
      const part = await this.catalog.findById(shortage.partId);
      if (!part) throw new PurchaseOrderApplicationError('PART_NOT_FOUND');

      purchaseOrder.addItem(
        new PurchaseOrderItem({
          partId: shortage.partId,
          quantity: Quantity.positive(shortage.quantity),
          unitPrice: part.unitPrice,
        }),
      );
    }

    return this.purchaseOrders.create(purchaseOrder);
  }

  private async nextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const sequence = (await this.purchaseOrders.countByYear(year)) + 1;
    return `PC-${year}-${String(sequence).padStart(4, '0')}`;
  }
}
