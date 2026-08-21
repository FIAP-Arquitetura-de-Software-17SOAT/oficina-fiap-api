import {
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';

import { PartController } from '../../stock/controllers/part.controller';

import {
  AddPurchaseOrderItemDto,
  CreatePurchaseOrderDto,
  RegisterShortageDto,
} from '../dto/purchase-order.dto';

import { PurchaseOrder } from '../entities/purchase-order.entity';

import { PurchaseOrderItem } from '../entities/purchase-order-item.entity';

import { PurchaseOrderRepository } from '../repositories/purchase-order.repository';

import { Money } from '../../../shared/domain/value-objects/money.vo';

import { PurchaseOrderNumber } from '../value-objects/purchase-order-number.vo';

import { Quantity } from '../value-objects/quantity.vo';

@Injectable()
export class PurchaseOrderService {
  // O estoque e alcancado pelo controller dele, nunca pelo service: e a porta de
  // entrada do agregado. forwardRef porque a relacao e mutua - o estoque abre o
  // pedido quando falta peca, e o pedido devolve a peca quando e entregue.
  constructor(
    private readonly repository: PurchaseOrderRepository,
    @Inject(forwardRef(() => PartController))
    private readonly partController: PartController,
  ) {}

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const purchaseOrder = new PurchaseOrder({
      number: PurchaseOrderNumber.create(dto.number),

      supplier: dto.supplier,
    });

    return this.repository.create(purchaseOrder);
  }

  async findAll(): Promise<PurchaseOrder[]> {
    return this.repository.findAll();
  }

  async findById(id: string): Promise<PurchaseOrder> {
    const purchaseOrder = await this.repository.findById(id);

    if (!purchaseOrder) {
      throw new NotFoundException('Pedido de compra não encontrado');
    }

    return purchaseOrder;
  }

  async addItem(
    id: string,
    dto: AddPurchaseOrderItemDto,
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findById(id);

    const item = new PurchaseOrderItem({
      partId: dto.partId,

      quantity: Quantity.create(dto.quantity),

      unitPrice: Money.fromDecimal(dto.unitPrice),
    });

    purchaseOrder.addItem(item);

    return this.repository.update(purchaseOrder);
  }

  async removeItem(id: string, itemId: string): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findById(id);

    purchaseOrder.removeItem(itemId);

    return this.repository.update(purchaseOrder);
  }

  async registerPurchase(id: string): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findById(id);

    purchaseOrder.registerPurchase();

    return this.repository.update(purchaseOrder);
  }

  async markAsDelivered(id: string): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findById(id);

    purchaseOrder.markAsDelivered();

    const delivered = await this.repository.update(purchaseOrder);

    // Politica do Event Storming: "Quando o status do pedido for atualizado para
    // entregue, o estoque sera atualizado somando a quantidade de pecas
    // recebidas". A chave de idempotencia deriva do pedido e do item, entao
    // reentregar o mesmo pedido nao soma duas vezes.
    for (const item of delivered.getItems()) {
      await this.partController.increaseStock(item.getPecaId(), {
        quantity: item.getQuantity().value,
        idempotencyKey: `purchase-order:${delivered.getId()}:${item.getId()}`,
      });
    }

    return delivered;
  }

  /**
   * Politica do Event Storming: "Quando o estoque for consultado, caso nao tenha
   * pecas suficientes, o estoquista ira registrar necessidade de compra".
   *
   * O pedido nasce em NEEDS_PURCHASE com o numero sequencial do ano e o preco
   * unitario copiado do cadastro da peca - snapshot, como manda o modelo de
   * dominio.
   */
  async registerShortage(dto: RegisterShortageDto): Promise<PurchaseOrder> {
    const purchaseOrder = new PurchaseOrder({
      number: PurchaseOrderNumber.create(await this.nextNumber()),

      supplier: dto.supplier?.trim() || 'A definir',
    });

    for (const shortage of dto.items) {
      const part = await this.partController.findById(shortage.partId);

      purchaseOrder.addItem(
        new PurchaseOrderItem({
          partId: shortage.partId,

          quantity: Quantity.create(shortage.quantity),

          unitPrice: Money.fromDecimal(part.unitPrice),
        }),
      );
    }

    return this.repository.create(purchaseOrder);
  }

  private async nextNumber(): Promise<string> {
    const year = new Date().getFullYear();

    const sequence = (await this.repository.countByYear(year)) + 1;

    return `PC-${year}-${String(sequence).padStart(4, '0')}`;
  }
}
