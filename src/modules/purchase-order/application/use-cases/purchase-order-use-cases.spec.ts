import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { Quantity } from '../../../../shared/domain/value-objects/quantity.vo';
import { PurchaseOrderItem } from '../../domain/entities/purchase-order-item.entity';
import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderStatus } from '../../domain/enums/purchase-order-status.enum';
import { PurchaseOrderNumber } from '../../domain/value-objects/purchase-order-number.vo';
import { PurchaseOrderRepositoryPort } from '../ports/purchase-order-repository.port';
import { AddPurchaseOrderItemUseCase } from './add-purchase-order-item.use-case';
import { CreatePurchaseOrderUseCase } from './create-purchase-order.use-case';
import { FindPurchaseOrderUseCase } from './find-purchase-order.use-case';
import { ListPurchaseOrdersUseCase } from './list-purchase-orders.use-case';
import { MarkPurchaseOrderDeliveredUseCase } from './mark-purchase-order-delivered.use-case';
import { RegisterPurchaseUseCase } from './register-purchase.use-case';
import { RegisterShortageUseCase } from './register-shortage.use-case';
import { RemovePurchaseOrderItemUseCase } from './remove-purchase-order-item.use-case';
import { ResolvePartNamesQuery } from './resolve-part-names.query';

type MockedRepository = { [K in keyof PurchaseOrderRepositoryPort]: jest.Mock };

const createPurchaseOrder = (): PurchaseOrder =>
  new PurchaseOrder({
    id: 'purchase-order-id',
    number: PurchaseOrderNumber.create('PC-2026-0042'),
    supplier: 'Auto Peças São Paulo',
  });

const item = (id?: string, partId = 'part-id', quantity = 1) =>
  new PurchaseOrderItem({
    id,
    partId,
    quantity: Quantity.positive(quantity),
    unitPrice: Money.fromDecimal(100),
  });

describe('Purchase order use cases without Nest', () => {
  let repository: MockedRepository;
  let catalog: { findById: jest.Mock };
  let stock: { increase: jest.Mock };

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      countByYear: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    };
    catalog = { findById: jest.fn() };
    stock = { increase: jest.fn() };
    repository.update.mockImplementation((order: PurchaseOrder) =>
      Promise.resolve(order),
    );
    repository.create.mockImplementation((order: PurchaseOrder) =>
      Promise.resolve(order),
    );
  });

  it('creates a purchase order in NEEDS_PURCHASE', async () => {
    const result = await new CreatePurchaseOrderUseCase(repository).execute({
      number: 'PC-2026-0042',
      supplier: 'Auto Peças São Paulo',
    });

    expect(result.getNumber().value).toBe('PC-2026-0042');
    expect(result.getStatus()).toBe(PurchaseOrderStatus.NEEDS_PURCHASE);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('lists purchase orders', async () => {
    repository.findAll.mockResolvedValue([createPurchaseOrder()]);

    await expect(
      new ListPurchaseOrdersUseCase(repository).execute(),
    ).resolves.toHaveLength(1);
  });

  it('finds a purchase order and fails with PURCHASE_ORDER_NOT_FOUND', async () => {
    const order = createPurchaseOrder();
    repository.findById
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(null);
    const find = new FindPurchaseOrderUseCase(repository);

    await expect(find.execute('purchase-order-id')).resolves.toBe(order);
    await expect(find.execute('missing')).rejects.toMatchObject({
      code: 'PURCHASE_ORDER_NOT_FOUND',
      message: 'Pedido de compra não encontrado',
    });
  });

  it('adds an item and persists the purchase order', async () => {
    repository.findById.mockResolvedValue(createPurchaseOrder());

    const result = await new AddPurchaseOrderItemUseCase(repository).execute(
      'purchase-order-id',
      { partId: 'part-id', quantity: 2, unitPrice: 150.5 },
    );

    expect(result.getItems()).toHaveLength(1);
    expect(result.getItems()[0].getUnitPrice().valueInCents).toBe(15050);
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('removes an item and persists the purchase order', async () => {
    const order = createPurchaseOrder();
    order.addItem(item('item-id'));
    repository.findById.mockResolvedValue(order);

    const result = await new RemovePurchaseOrderItemUseCase(repository).execute(
      'purchase-order-id',
      'item-id',
    );

    expect(result.getItems()).toHaveLength(0);
  });

  it('registers the purchase', async () => {
    const order = createPurchaseOrder();
    order.addItem(item());
    repository.findById.mockResolvedValue(order);

    const result = await new RegisterPurchaseUseCase(repository).execute(
      'purchase-order-id',
    );

    expect(result.getStatus()).toBe(PurchaseOrderStatus.AWAITING_DELIVERY);
  });

  it('marks as delivered and adds the received quantities to stock idempotently', async () => {
    const order = createPurchaseOrder();
    order.addItem(item('item-id', 'part-id', 4));
    order.registerPurchase();
    repository.findById.mockResolvedValue(order);

    const result = await new MarkPurchaseOrderDeliveredUseCase(
      repository,
      stock,
    ).execute('purchase-order-id');

    expect(result.getStatus()).toBe(PurchaseOrderStatus.DELIVERED);
    expect(result.getDeliveredAt()).toBeDefined();
    expect(stock.increase).toHaveBeenCalledWith(
      'part-id',
      4,
      'purchase-order:purchase-order-id:item-id',
    );
  });

  describe('registerShortage', () => {
    it('opens the purchase order with the yearly sequence and the part price snapshot', async () => {
      repository.countByYear.mockResolvedValue(41);
      catalog.findById.mockResolvedValue({
        id: 'part-id',
        name: 'Filtro de óleo',
        unitPrice: Money.fromDecimal(149.9),
      });

      const result = await new RegisterShortageUseCase(
        repository,
        catalog,
      ).execute({ items: [{ partId: 'part-id', quantity: 3 }] });

      expect(result.getNumber().value).toBe(
        `PC-${new Date().getFullYear()}-0042`,
      );
      expect(result.getSupplier()).toBe('A definir');
      expect(result.getStatus()).toBe(PurchaseOrderStatus.NEEDS_PURCHASE);
      expect(result.getItems()[0].getUnitPrice().valueInCents).toBe(14_990);
      expect(result.getItems()[0].getQuantity().getValue()).toBe(3);
    });

    it('keeps the supplier when informed', async () => {
      repository.countByYear.mockResolvedValue(0);
      catalog.findById.mockResolvedValue({
        id: 'part-id',
        name: 'x',
        unitPrice: Money.fromDecimal(1),
      });

      const result = await new RegisterShortageUseCase(
        repository,
        catalog,
      ).execute({
        supplier: ' Fornecedor ',
        items: [{ partId: 'part-id', quantity: 1 }],
      });

      expect(result.getSupplier()).toBe('Fornecedor');
    });

    it('PART_NOT_FOUND when the catalog does not know the part', async () => {
      repository.countByYear.mockResolvedValue(0);
      catalog.findById.mockResolvedValue(null);

      await expect(
        new RegisterShortageUseCase(repository, catalog).execute({
          items: [{ partId: 'missing', quantity: 1 }],
        }),
      ).rejects.toMatchObject({
        code: 'PART_NOT_FOUND',
        message: 'Peça não encontrada',
      });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  it('resolves part names once per distinct part and nulls the missing ones', async () => {
    const order = createPurchaseOrder();
    order.addItem(item('a', 'part-1'));
    order.addItem(item('b', 'part-1'));
    order.addItem(item('c', 'part-2'));
    catalog.findById.mockImplementation((partId: string) =>
      Promise.resolve(
        partId === 'part-1'
          ? { id: partId, name: 'Filtro', unitPrice: Money.fromDecimal(1) }
          : null,
      ),
    );

    const names = await new ResolvePartNamesQuery(catalog).execute([order]);

    expect(catalog.findById).toHaveBeenCalledTimes(2);
    expect(names.get('part-1')).toBe('Filtro');
    expect(names.get('part-2')).toBeNull();
  });
});
