import { Test, TestingModule } from '@nestjs/testing';

import { PurchaseOrderController } from './purchase-order.controller';

import { PurchaseOrderService } from '../services/purchase-order.service';

import { PurchaseOrder } from '../entities/purchase-order.entity';

import { PurchaseOrderNumber } from '../value-objects/purchase-order-number.vo';

describe('PurchaseOrderController', () => {
  let controller: PurchaseOrderController;

  let service: jest.Mocked<PurchaseOrderService>;

  const createPurchaseOrder = (): PurchaseOrder =>
    new PurchaseOrder({
      id: 'purchase-order-id',

      number: PurchaseOrderNumber.create('PC-2026-0042'),

      supplier: 'Auto Peças São Paulo',
    });

  beforeEach(async () => {
    const serviceMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      addItem: jest.fn(),
      removeItem: jest.fn(),
      registerPurchase: jest.fn(),
      markAsDelivered: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseOrderController],

      providers: [
        {
          provide: PurchaseOrderService,

          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get(PurchaseOrderController);

    service = module.get(PurchaseOrderService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create purchase order', async () => {
      const order = createPurchaseOrder();

      service.create.mockResolvedValue(order);

      const result = await controller.create({
        number: 'PC-2026-0042',

        supplier: 'Auto Peças São Paulo',
      });

      expect(service.create).toHaveBeenCalledWith({
        number: 'PC-2026-0042',

        supplier: 'Auto Peças São Paulo',
      });

      expect(result.id).toBe('purchase-order-id');

      expect(result.number).toBe('PC-2026-0042');
    });
  });

  describe('findAll', () => {
    it('should return purchase orders', async () => {
      service.findAll.mockResolvedValue([createPurchaseOrder()]);

      const result = await controller.findAll();

      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return purchase order', async () => {
      service.findById.mockResolvedValue(createPurchaseOrder());

      const result = await controller.findById('purchase-order-id');

      expect(service.findById).toHaveBeenCalledWith('purchase-order-id');

      expect(result.id).toBe('purchase-order-id');
    });
  });
});
