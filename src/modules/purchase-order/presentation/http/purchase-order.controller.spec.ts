import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderNumber } from '../../domain/value-objects/purchase-order-number.vo';
import { AddPurchaseOrderItemUseCase } from '../../application/use-cases/add-purchase-order-item.use-case';
import { CreatePurchaseOrderUseCase } from '../../application/use-cases/create-purchase-order.use-case';
import { FindPurchaseOrderUseCase } from '../../application/use-cases/find-purchase-order.use-case';
import { ListPurchaseOrdersUseCase } from '../../application/use-cases/list-purchase-orders.use-case';
import { MarkPurchaseOrderDeliveredUseCase } from '../../application/use-cases/mark-purchase-order-delivered.use-case';
import { RegisterPurchaseUseCase } from '../../application/use-cases/register-purchase.use-case';
import { RegisterShortageUseCase } from '../../application/use-cases/register-shortage.use-case';
import { RemovePurchaseOrderItemUseCase } from '../../application/use-cases/remove-purchase-order-item.use-case';
import { ResolvePartNamesQuery } from '../../application/use-cases/resolve-part-names.query';
import { PurchaseOrderController } from './purchase-order.controller';

describe('PurchaseOrderController', () => {
  let controller: PurchaseOrderController;
  let service: Record<
    | 'create'
    | 'findAll'
    | 'findById'
    | 'addItem'
    | 'removeItem'
    | 'registerPurchase'
    | 'markAsDelivered'
    | 'registerShortage'
    | 'resolvePartNames',
    jest.Mock
  >;

  const createPurchaseOrder = (): PurchaseOrder =>
    new PurchaseOrder({
      id: 'purchase-order-id',
      number: PurchaseOrderNumber.create('PC-2026-0042'),
      supplier: 'Auto Peças São Paulo',
    });

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      addItem: jest.fn(),
      removeItem: jest.fn(),
      registerPurchase: jest.fn(),
      markAsDelivered: jest.fn(),
      registerShortage: jest.fn(),
      // O controller pede o nome das peças à query, que fala com o estoque.
      // Sem peça resolvida o item sai com partName null.
      resolvePartNames: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseOrderController],
      providers: [
        {
          provide: CreatePurchaseOrderUseCase,
          useValue: { execute: service.create },
        },
        {
          provide: RegisterShortageUseCase,
          useValue: { execute: service.registerShortage },
        },
        {
          provide: ListPurchaseOrdersUseCase,
          useValue: { execute: service.findAll },
        },
        {
          provide: FindPurchaseOrderUseCase,
          useValue: { execute: service.findById },
        },
        {
          provide: AddPurchaseOrderItemUseCase,
          useValue: { execute: service.addItem },
        },
        {
          provide: RemovePurchaseOrderItemUseCase,
          useValue: { execute: service.removeItem },
        },
        {
          provide: RegisterPurchaseUseCase,
          useValue: { execute: service.registerPurchase },
        },
        {
          provide: MarkPurchaseOrderDeliveredUseCase,
          useValue: { execute: service.markAsDelivered },
        },
        {
          provide: ResolvePartNamesQuery,
          useValue: { execute: service.resolvePartNames },
        },
      ],
    }).compile();

    controller = module.get(PurchaseOrderController);
  });

  it('creates a purchase order', async () => {
    service.create.mockResolvedValue(createPurchaseOrder());

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

  it('registers a shortage', async () => {
    service.registerShortage.mockResolvedValue(createPurchaseOrder());

    const result = await controller.registerShortage({
      items: [{ partId: 'part-id', quantity: 1 }],
    });

    expect(service.registerShortage).toHaveBeenCalledWith({
      items: [{ partId: 'part-id', quantity: 1 }],
    });
    expect(result.status).toBe('NEEDS_PURCHASE');
  });

  it('lists purchase orders resolving part names once', async () => {
    service.findAll.mockResolvedValue([createPurchaseOrder()]);

    const result = await controller.findAll();

    expect(result).toHaveLength(1);
    expect(service.resolvePartNames).toHaveBeenCalledTimes(1);
  });

  it('finds, adds, removes, registers and delivers through the use cases', async () => {
    const order = createPurchaseOrder();
    service.findById.mockResolvedValue(order);
    service.addItem.mockResolvedValue(order);
    service.removeItem.mockResolvedValue(order);
    service.registerPurchase.mockResolvedValue(order);
    service.markAsDelivered.mockResolvedValue(order);

    await controller.findById('purchase-order-id');
    await controller.addItem('purchase-order-id', {
      partId: 'part-id',
      quantity: 1,
      unitPrice: 10,
    });
    await controller.removeItem('purchase-order-id', 'item-id');
    await controller.registerPurchase('purchase-order-id');
    await controller.markAsDelivered('purchase-order-id');

    expect(service.findById).toHaveBeenCalledWith('purchase-order-id');
    expect(service.addItem).toHaveBeenCalledWith('purchase-order-id', {
      partId: 'part-id',
      quantity: 1,
      unitPrice: 10,
    });
    expect(service.removeItem).toHaveBeenCalledWith(
      'purchase-order-id',
      'item-id',
    );
    expect(service.registerPurchase).toHaveBeenCalledWith('purchase-order-id');
    expect(service.markAsDelivered).toHaveBeenCalledWith('purchase-order-id');
  });
});
