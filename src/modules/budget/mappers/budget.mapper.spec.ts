import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../entities/budget.entity';
import { BudgetMapper } from './budget.mapper';
import { Money } from '../../../shared/domain/value-objects/money.vo';

describe('BudgetMapper', () => {
  it('maps domain to persistence with calculated total and nested items', () => {
    const budget = Budget.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      version: 1,
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 2,
          unitPrice: Money.fromDecimal(50),
        },
      ],
    });

    const persistence = BudgetMapper.toPersistence(budget);

    expect(persistence.totalCents).toBe(10000);
    expect(persistence.items.create).toEqual([
      expect.objectContaining({
        description: 'Oil change',
        type: BudgetItemType.SERVICE,
        quantity: 2,
        unitPriceCents: 5000,
        subtotalCents: 10000,
      }),
    ]);
  });

  it('restores domain objects converting Prisma decimals to numbers', () => {
    const createdAt = new Date('2026-08-12T10:00:00.000Z');
    const updatedAt = new Date('2026-08-12T11:00:00.000Z');
    const budget = BudgetMapper.toDomain({
      id: 'budget-123',
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      version: 2,
      status: BudgetStatus.REFUSED,
      refusalReason: 'Too expensive',
      sentAt: createdAt,
      answeredAt: updatedAt,
      createdAt,
      updatedAt,
      items: [
        {
          id: 'item-123',
          partId: null,
          serviceId: null,
          description: 'Oil filter',
          type: BudgetItemType.PART,
          quantity: { toString: () => '2.5' },
          unitPriceCents: 4020,
        },
      ],
    });

    expect(budget.getId()).toBe('budget-123');
    expect(budget.getStatus()).toBe(BudgetStatus.REFUSED);
    expect(budget.getItems()[0].getQuantity()).toBe(2.5);
    expect(budget.getItems()[0].getUnitPrice().value).toBe(40.2);
    expect(budget.getCreatedAt()).toEqual(createdAt);
  });
});
