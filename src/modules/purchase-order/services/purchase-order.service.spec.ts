import { NotFoundException } from '@nestjs/common';

import { PurchaseOrderService } from './purchase-order.service';

import { PurchaseOrderRepository } from '../repositories/purchase-order.repository';

import { PurchaseOrder } from '../entities/purchase-order.entity';

import { PurchaseOrderItem } from '../entities/purchase-order-item.entity';

import { PurchaseOrderStatus } from '../enums/purchase-order-status.enum';

import { PurchaseOrderNumber } from '../value-objects/purchase-order-number.vo';

import { Money } from '../../../shared/domain/value-objects/money.vo';

import { Quantity } from '../../../shared/domain/value-objects/quantity.vo';

import { PartController } from '../../stock/controllers/part.controller';

describe('PurchaseOrderService', () => {
  let service: PurchaseOrderService;

  let partController: jest.Mocked<PartController>;

  let repository: jest.Mocked<PurchaseOrderRepository>;

  const createPurchaseOrder = (): PurchaseOrder =>
    new PurchaseOrder({
      id: 'purchase-order-id',

      number: PurchaseOrderNumber.create('PC-2026-0042'),

      supplier: 'Auto Peças São Paulo',
    });

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      countByYear: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<PurchaseOrderRepository>;

    partController = {
      findById: jest.fn(),
      increaseStock: jest.fn(),
    } as unknown as jest.Mocked<PartController>;

    service = new PurchaseOrderService(repository, partController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a purchase order', async () => {
      repository.create.mockImplementation(async (order) => order);

      const result = await service.create({
        number: 'PC-2026-0042',
        supplier: 'Auto Peças São Paulo',
      });

      expect(repository.create).toHaveBeenCalledTimes(1);

      expect(result.getNumber().value).toBe('PC-2026-0042');

      expect(result.getSupplier()).toBe('Auto Peças São Paulo');

      expect(result.getStatus()).toBe(PurchaseOrderStatus.NEEDS_PURCHASE);
    });
  });

  describe('findAll', () => {
    it('should return all purchase orders', async () => {
      const order = createPurchaseOrder();

      repository.findAll.mockResolvedValue([order]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);

      expect(repository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('should return purchase order', async () => {
      const order = createPurchaseOrder();

      repository.findById.mockResolvedValue(order);

      const result = await service.findById('purchase-order-id');

      expect(result).toBe(order);
    });

    it('should throw NotFoundException when purchase order does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('invalid-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('addItem', () => {
    it('should add an item and persist purchase order', async () => {
      const order = createPurchaseOrder();

      repository.findById.mockResolvedValue(order);

      repository.update.mockImplementation(
        async (purchaseOrder) => purchaseOrder,
      );

      const result = await service.addItem('purchase-order-id', {
        partId: '550e8400-e29b-41d4-a716-446655440000',

        quantity: 2,

        unitPrice: 150.5,
      });

      expect(result.getItems()).toHaveLength(1);

      expect(repository.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeItem', () => {
    it('should remove item and persist purchase order', async () => {
      const order = createPurchaseOrder();

      order.addItem(
        new PurchaseOrderItem({
          id: 'item-id',

          partId: '550e8400-e29b-41d4-a716-446655440000',

          quantity: Quantity.positive(1),

          unitPrice: Money.fromDecimal(100),
        }),
      );

      repository.findById.mockResolvedValue(order);

      repository.update.mockImplementation(
        async (purchaseOrder) => purchaseOrder,
      );

      const result = await service.removeItem('purchase-order-id', 'item-id');

      expect(result.getItems()).toHaveLength(0);

      expect(repository.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerPurchase', () => {
    it('should register purchase', async () => {
      const order = createPurchaseOrder();

      order.addItem(
        new PurchaseOrderItem({
          partId: 'peca-id',

          quantity: Quantity.positive(1),

          unitPrice: Money.fromDecimal(100),
        }),
      );

      repository.findById.mockResolvedValue(order);

      repository.update.mockImplementation(
        async (purchaseOrder) => purchaseOrder,
      );

      const result = await service.registerPurchase('purchase-order-id');

      expect(result.getStatus()).toBe(PurchaseOrderStatus.AWAITING_DELIVERY);

      expect(repository.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('markAsDelivered', () => {
    it('should mark purchase order as delivered', async () => {
      const order = createPurchaseOrder();

      order.addItem(
        new PurchaseOrderItem({
          partId: 'peca-id',

          quantity: Quantity.positive(1),

          unitPrice: Money.fromDecimal(100),
        }),
      );

      order.registerPurchase();

      repository.findById.mockResolvedValue(order);

      repository.update.mockImplementation(
        async (purchaseOrder) => purchaseOrder,
      );

      const result = await service.markAsDelivered('purchase-order-id');

      expect(result.getStatus()).toBe(PurchaseOrderStatus.DELIVERED);

      expect(result.getDeliveredAt()).toBeDefined();

      expect(repository.update).toHaveBeenCalledTimes(1);
    });
  });
  describe('políticas do Event Storming', () => {
    it('soma ao estoque a quantidade recebida quando o pedido é entregue', async () => {
      const order = createPurchaseOrder();

      order.addItem(
        new PurchaseOrderItem({
          id: 'item-id',

          partId: 'part-id',

          quantity: Quantity.positive(4),

          unitPrice: Money.fromDecimal(100),
        }),
      );

      order.registerPurchase();

      repository.findById.mockResolvedValue(order);

      repository.update.mockImplementation(
        async (purchaseOrder) => purchaseOrder,
      );

      await service.markAsDelivered('purchase-order-id');

      expect(partController.increaseStock).toHaveBeenCalledWith('part-id', {
        quantity: 4,
        idempotencyKey: 'purchase-order:purchase-order-id:item-id',
      });
    });

    it('abre o pedido da falta com número sequencial e preço da peça', async () => {
      repository.countByYear.mockResolvedValue(41);

      partController.findById.mockResolvedValue({
        unitPrice: 149.9,
      } as never);

      repository.create.mockImplementation(
        async (purchaseOrder) => purchaseOrder,
      );

      const result = await service.registerShortage({
        items: [{ partId: 'part-id', quantity: 3 }],
      });

      expect(result.getNumber().value).toBe(
        `PC-${new Date().getFullYear()}-0042`,
      );
      expect(result.getSupplier()).toBe('A definir');
      expect(result.getStatus()).toBe(PurchaseOrderStatus.NEEDS_PURCHASE);
      expect(result.getItems()).toHaveLength(1);
      expect(result.getItems()[0].getUnitPrice().valueInCents).toBe(14_990);
      expect(result.getItems()[0].getQuantity().getValue()).toBe(3);
    });
  });
});
