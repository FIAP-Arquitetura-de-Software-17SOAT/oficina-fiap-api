import {
  NotFoundException,
} from '@nestjs/common';

import {
  PurchaseOrderService,
} from './purchase-order.service';

import {
  PurchaseOrderRepository,
} from '../repositories/purchase-order.repository';

import {
  PurchaseOrder,
} from '../entities/purchase-order.entity';

import {
  PurchaseOrderItem,
} from '../entities/purchase-order-item.entity';

import {
  PurchaseOrderStatus,
} from '../enums/purchase-order-status.enum';

import {
  PurchaseOrderNumber,
} from '../value-objects/purchase-order-number.vo';

import {
  Money,
} from '../value-objects/money.vo';

import {
  Quantity,
} from '../value-objects/quantity.vo';

describe('PurchaseOrderService', () => {
  let service: PurchaseOrderService;

  let repository: jest.Mocked<PurchaseOrderRepository>;

  const createPurchaseOrder =
    (): PurchaseOrder =>
      new PurchaseOrder({
        id: 'purchase-order-id',

        number:
          PurchaseOrderNumber.create(
            'PC-2026-0042',
          ),

        supplier:
          'Auto Peças São Paulo',
      });

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<PurchaseOrderRepository>;

    service =
      new PurchaseOrderService(
        repository,
      );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a purchase order', async () => {
      repository.create.mockImplementation(
        async (order) => order,
      );

      const result =
        await service.create({
          number: 'PC-2026-0042',
          supplier:
            'Auto Peças São Paulo',
        });

      expect(
        repository.create,
      ).toHaveBeenCalledTimes(1);

      expect(result.getNumber().value).toBe(
        'PC-2026-0042',
      );

      expect(result.getSupplier()).toBe(
        'Auto Peças São Paulo',
      );

      expect(result.getStatus()).toBe(
        PurchaseOrderStatus.NECESSITA_COMPRA,
      );
    });
  });

  describe('findAll', () => {
    it('should return all purchase orders', async () => {
      const order =
        createPurchaseOrder();

      repository.findAll.mockResolvedValue([
        order,
      ]);

      const result =
        await service.findAll();

      expect(result).toHaveLength(1);

      expect(
        repository.findAll,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('should return purchase order', async () => {
      const order =
        createPurchaseOrder();

      repository.findById.mockResolvedValue(
        order,
      );

      const result =
        await service.findById(
          'purchase-order-id',
        );

      expect(result).toBe(order);
    });

    it('should throw NotFoundException when purchase order does not exist', async () => {
      repository.findById.mockResolvedValue(
        null,
      );

      await expect(
        service.findById('invalid-id'),
      ).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('addItem', () => {
    it('should add an item and persist purchase order', async () => {
      const order =
        createPurchaseOrder();

      repository.findById.mockResolvedValue(
        order,
      );

      repository.update.mockImplementation(
        async (purchaseOrder) =>
          purchaseOrder,
      );

      const result =
        await service.addItem(
          'purchase-order-id',
          {
            pecaId:
              '550e8400-e29b-41d4-a716-446655440000',

            quantity: 2,

            unitPrice: 150.5,
          },
        );

      expect(
        result.getItems(),
      ).toHaveLength(1);

      expect(
        repository.update,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeItem', () => {
    it('should remove item and persist purchase order', async () => {
      const order =
        createPurchaseOrder();

      order.addItem(
        new PurchaseOrderItem({
          id: 'item-id',

          pecaId:
            '550e8400-e29b-41d4-a716-446655440000',

          quantity:
            Quantity.create(1),

          unitPrice:
            Money.fromDecimal(100),
        }),
      );

      repository.findById.mockResolvedValue(
        order,
      );

      repository.update.mockImplementation(
        async (purchaseOrder) =>
          purchaseOrder,
      );

      const result =
        await service.removeItem(
          'purchase-order-id',
          'item-id',
        );

      expect(
        result.getItems(),
      ).toHaveLength(0);

      expect(
        repository.update,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerPurchase', () => {
    it('should register purchase', async () => {
      const order =
        createPurchaseOrder();

      order.addItem(
        new PurchaseOrderItem({
          pecaId: 'peca-id',

          quantity:
            Quantity.create(1),

          unitPrice:
            Money.fromDecimal(100),
        }),
      );

      repository.findById.mockResolvedValue(
        order,
      );

      repository.update.mockImplementation(
        async (purchaseOrder) =>
          purchaseOrder,
      );

      const result =
        await service.registerPurchase(
          'purchase-order-id',
        );

      expect(result.getStatus()).toBe(
        PurchaseOrderStatus.AGUARDANDO_ENTREGA,
      );

      expect(
        repository.update,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('markAsDelivered', () => {
    it('should mark purchase order as delivered', async () => {
      const order =
        createPurchaseOrder();

      order.addItem(
        new PurchaseOrderItem({
          pecaId: 'peca-id',

          quantity:
            Quantity.create(1),

          unitPrice:
            Money.fromDecimal(100),
        }),
      );

      order.registerPurchase();

      repository.findById.mockResolvedValue(
        order,
      );

      repository.update.mockImplementation(
        async (purchaseOrder) =>
          purchaseOrder,
      );

      const result =
        await service.markAsDelivered(
          'purchase-order-id',
        );

      expect(result.getStatus()).toBe(
        PurchaseOrderStatus.ENTREGUE,
      );

      expect(
        result.getDeliveredAt(),
      ).toBeDefined();

      expect(
        repository.update,
      ).toHaveBeenCalledTimes(1);
    });
  });
});