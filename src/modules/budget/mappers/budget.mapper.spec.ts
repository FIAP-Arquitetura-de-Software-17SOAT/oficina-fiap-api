import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../entities/budget.entity';
import { BudgetMapper } from './budget.mapper';

describe('BudgetMapper', () => {
  it('maps domain to persistence with calculated total and nested items', () => {
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 2,
          unitPrice: 50,
        },
      ],
    });

    const persistence = BudgetMapper.toPersistence(budget);

    expect(persistence.totalAmount).toBe(100);
    expect(persistence.items.create).toEqual([
      expect.objectContaining({
        description: 'Oil change',
        type: BudgetItemType.SERVICE,
        quantity: 2,
        unitPrice: 50,
        subtotal: 100,
      }),
    ]);
  });

  it('restores domain objects converting Prisma decimals to numbers', () => {
    const createdAt = new Date('2026-08-12T10:00:00.000Z');
    const updatedAt = new Date('2026-08-12T11:00:00.000Z');
    const budget = BudgetMapper.toDomain({
      id: 'budget-123',
      serviceOrderId: 'service-123',
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
          description: 'Oil filter',
          type: BudgetItemType.PART,
          quantity: { toString: () => '2.5' },
          unitPrice: { toString: () => '40.2' },
        },
      ],
    });

    expect(budget.getId()).toBe('budget-123');
    expect(budget.getStatus()).toBe(BudgetStatus.REFUSED);
    expect(budget.getItems()[0].getQuantity()).toBe(2.5);
    expect(budget.getItems()[0].getUnitPrice()).toBe(40.2);
    expect(budget.getCreatedAt()).toEqual(createdAt);
  });
});
