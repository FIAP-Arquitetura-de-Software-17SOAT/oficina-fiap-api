import { AcceptedBudget } from '../ports/accepted-budgets.port';
import { DispatchPartsForServiceOrderUseCase } from './dispatch-parts-for-service-order.use-case';

const SERVICE_ORDER_ID = 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const PART_ID = 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const makeBudget = (
  overrides: Partial<AcceptedBudget> = {},
): AcceptedBudget => ({
  id: 'budget-1',
  version: 1,
  partItems: [{ partId: PART_ID, description: 'Filtro de óleo', quantity: 2 }],
  ...overrides,
});

const makePart = (quantity: number) => ({
  id: PART_ID,
  name: 'Filtro de óleo',
  quantity,
});

describe('DispatchPartsForServiceOrderUseCase', () => {
  let budgets: { findAccepted: jest.Mock };
  let stock: { findPart: jest.Mock; decrease: jest.Mock };
  let serviceOrders: { registerPartsDispatched: jest.Mock };
  let purchases: { registerShortage: jest.Mock };
  let useCase: DispatchPartsForServiceOrderUseCase;

  beforeEach(() => {
    budgets = { findAccepted: jest.fn() };
    stock = { findPart: jest.fn(), decrease: jest.fn() };
    serviceOrders = { registerPartsDispatched: jest.fn() };
    purchases = { registerShortage: jest.fn() };
    useCase = new DispatchPartsForServiceOrderUseCase(
      budgets,
      stock,
      serviceOrders,
      purchases,
    );
  });

  it('baixa o estoque e move a OS para execução quando há saldo', async () => {
    budgets.findAccepted.mockResolvedValue([makeBudget()]);
    stock.findPart.mockResolvedValue(makePart(5));

    const result = await useCase.execute(SERVICE_ORDER_ID);

    expect(stock.decrease).toHaveBeenCalledWith(
      PART_ID,
      2,
      `budget:budget-1:part:${PART_ID}`,
    );
    expect(serviceOrders.registerPartsDispatched).toHaveBeenCalledWith(
      SERVICE_ORDER_ID,
    );
    expect(result).toEqual({
      serviceOrderId: SERVICE_ORDER_ID,
      dispatched: true,
      purchaseOrderId: null,
      requirements: [
        {
          partId: PART_ID,
          partName: 'Filtro de óleo',
          required: 2,
          available: 5,
        },
      ],
    });
  });

  it('abre pedido de compra com a diferença e não baixa nada quando falta peça', async () => {
    budgets.findAccepted.mockResolvedValue([makeBudget()]);
    stock.findPart.mockResolvedValue(makePart(1));
    purchases.registerShortage.mockResolvedValue({ id: 'purchase-order-1' });

    const result = await useCase.execute(SERVICE_ORDER_ID);

    expect(purchases.registerShortage).toHaveBeenCalledWith([
      { partId: PART_ID, quantity: 1 },
    ]);
    expect(stock.decrease).not.toHaveBeenCalled();
    expect(serviceOrders.registerPartsDispatched).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dispatched: false,
      purchaseOrderId: 'purchase-order-1',
    });
  });

  it('usa o orçamento aceito de maior versão', async () => {
    budgets.findAccepted.mockResolvedValue([
      makeBudget({ id: 'budget-1', version: 1 }),
      makeBudget({ id: 'budget-2', version: 2 }),
    ]);
    stock.findPart.mockResolvedValue(makePart(5));

    await useCase.execute(SERVICE_ORDER_ID);

    expect(stock.decrease).toHaveBeenCalledWith(
      PART_ID,
      2,
      `budget:budget-2:part:${PART_ID}`,
    );
  });

  it('arredonda quantidade fracionária para cima', async () => {
    budgets.findAccepted.mockResolvedValue([
      makeBudget({
        partItems: [{ partId: PART_ID, description: 'Óleo', quantity: 2.5 }],
      }),
    ]);
    stock.findPart.mockResolvedValue(makePart(5));

    await useCase.execute(SERVICE_ORDER_ID);

    expect(stock.decrease).toHaveBeenCalledWith(PART_ID, 3, expect.any(String));
  });

  it('recusa OS sem orçamento aceito', async () => {
    budgets.findAccepted.mockResolvedValue([]);

    await expect(useCase.execute(SERVICE_ORDER_ID)).rejects.toMatchObject({
      code: 'NO_ACCEPTED_BUDGET',
      kind: 'INVALID',
      message: 'Service order has no accepted budget to dispatch parts for',
    });
  });

  it('libera a OS sem baixar nada quando o orçamento só tem serviços', async () => {
    budgets.findAccepted.mockResolvedValue([makeBudget({ partItems: [] })]);

    const result = await useCase.execute(SERVICE_ORDER_ID);

    expect(stock.decrease).not.toHaveBeenCalled();
    expect(serviceOrders.registerPartsDispatched).toHaveBeenCalledWith(
      SERVICE_ORDER_ID,
    );
    expect(result.dispatched).toBe(true);
    expect(result.requirements).toEqual([]);
  });

  it('recusa item de peça que não referencia peça em vez de ignorá-lo', async () => {
    budgets.findAccepted.mockResolvedValue([
      makeBudget({
        partItems: [
          { partId: null, description: 'Filtro sem referência', quantity: 1 },
        ],
      }),
    ]);

    await expect(useCase.execute(SERVICE_ORDER_ID)).rejects.toMatchObject({
      code: 'PART_ITEM_WITHOUT_REFERENCE',
      kind: 'INVALID',
      message:
        'Accepted budget has part items without a part reference: Filtro sem referência',
    });
    expect(stock.decrease).not.toHaveBeenCalled();
  });

  it('PART_NOT_FOUND quando o estoque não conhece a peça do orçamento', async () => {
    budgets.findAccepted.mockResolvedValue([makeBudget()]);
    stock.findPart.mockResolvedValue(null);

    await expect(useCase.execute(SERVICE_ORDER_ID)).rejects.toMatchObject({
      code: 'PART_NOT_FOUND',
      kind: 'NOT_FOUND',
      message: 'Peça não encontrada',
    });
  });
});
