import { DomainException } from '../../../shared/domain/domain.exception';
import { Budget, BudgetStatus, BudgetItemType } from './budget.entity';

const serviceItem = {
  description: 'Oil change',
  type: BudgetItemType.SERVICE,
  quantity: 1,
  unitPrice: 120,
};

describe('Budget', () => {
  it('creates a generated budget with total calculated from items', () => {
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
    });

    expect(budget.getServiceOrderId()).toBe('service-123');
    expect(budget.getVersion()).toBe(1);
    expect(budget.getStatus()).toBe(BudgetStatus.GENERATED);
    expect(budget.getTotalAmount()).toBe(120);
  });

  it('calculates fractional item subtotals and totals to two decimal places', () => {
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [
        {
          description: 'Part one',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 0.1,
        },
        {
          description: 'Part two',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 0.2,
        },
      ],
    });

    expect(budget.getItems().map((item) => item.getSubtotal())).toEqual([
      0.1, 0.2,
    ]);
    expect(budget.getTotalAmount()).toBe(0.3);
  });

  it('rejects monetary values beyond two decimal places or Decimal(10,2) range', () => {
    expect(() =>
      Budget.create({
        serviceOrderId: 'service-123',
        version: 1,
        items: [
          {
            description: 'Precision overflow',
            type: BudgetItemType.PART,
            quantity: 1.001,
            unitPrice: 1,
          },
        ],
      }),
    ).toThrow(DomainException);

    expect(() =>
      Budget.create({
        serviceOrderId: 'service-123',
        version: 1,
        items: [
          {
            description: 'Range overflow',
            type: BudgetItemType.PART,
            quantity: 1,
            unitPrice: 100_000_000,
          },
        ],
      }),
    ).toThrow(DomainException);
  });

  it('rejects item subtotals that exceed Decimal(10,2) range', () => {
    expect(() =>
      Budget.create({
        serviceOrderId: 'service-123',
        version: 1,
        items: [
          {
            description: 'Subtotal overflow',
            type: BudgetItemType.PART,
            quantity: 1_000_000,
            unitPrice: 100,
          },
        ],
      }),
    ).toThrow(DomainException);
  });

  it('does not allow creating without serviceOrderId', () => {
    expect(() =>
      Budget.create({ serviceOrderId: '', version: 1, items: [serviceItem] }),
    ).toThrow(DomainException);
  });

  it('does not allow creating without items', () => {
    expect(() =>
      Budget.create({ serviceOrderId: 'service-123', version: 1, items: [] }),
    ).toThrow(DomainException);
  });

  it('sends generated budget to customer approval', () => {
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
    });

    budget.sendToCustomer();

    expect(budget.getStatus()).toBe(BudgetStatus.WAITING_APPROVAL);
    expect(budget.getSentAt()).toBeInstanceOf(Date);
  });

  it('adds and removes items while budget is generated', () => {
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
    });

    budget.addItem({
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: 40,
    });

    const addedItem = budget
      .getItems()
      .find((item) => item.getDescription() === 'Oil filter');

    expect(addedItem).toBeDefined();
    expect(budget.getTotalAmount()).toBe(160);

    budget.removeItem(addedItem!.getId());

    expect(budget.getItems()).toHaveLength(1);
    expect(budget.getTotalAmount()).toBe(120);
  });

  it('advances updatedAt when a mutation occurs in the same clock millisecond', () => {
    const originalUpdatedAt = new Date('2099-01-01T00:00:00.000Z');
    const budget = Budget.restore('budget-123', {
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
      status: BudgetStatus.GENERATED,
      updatedAt: originalUpdatedAt,
    });

    budget.addItem({
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: 40,
    });

    expect(budget.getUpdatedAt().getTime()).toBeGreaterThan(
      originalUpdatedAt.getTime(),
    );
  });

  it('does not allow changing items after sending to customer', () => {
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
    });

    budget.sendToCustomer();

    expect(() =>
      budget.addItem({
        description: 'Oil filter',
        type: BudgetItemType.PART,
        quantity: 1,
        unitPrice: 40,
      }),
    ).toThrow(DomainException);

    expect(() => budget.removeItem(budget.getItems()[0].getId())).toThrow(
      DomainException,
    );
  });

  it('accepts only budgets waiting for approval', () => {
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
    });

    expect(() => budget.accept()).toThrow(DomainException);

    budget.sendToCustomer();
    budget.accept();

    expect(budget.getStatus()).toBe(BudgetStatus.ACCEPTED);
    expect(budget.getAnsweredAt()).toBeInstanceOf(Date);
    expect(budget.getRefusalReason()).toBeNull();
  });

  it('clears a persisted refusal reason when accepting', () => {
    const budget = Budget.restore('budget-123', {
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
      status: BudgetStatus.WAITING_APPROVAL,
      refusalReason: 'Previous refusal',
    });

    budget.accept();

    expect(budget.getStatus()).toBe(BudgetStatus.ACCEPTED);
    expect(budget.getRefusalReason()).toBeNull();
  });

  it('refuses only budgets waiting for approval, trims reason, and stores answeredAt', () => {
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
    });

    budget.sendToCustomer();
    budget.refuse('  Customer found it expensive  ');

    expect(budget.getStatus()).toBe(BudgetStatus.REFUSED);
    expect(budget.getRefusalReason()).toBe('Customer found it expensive');
    expect(budget.getAnsweredAt()).toBeInstanceOf(Date);
  });

  it('requires a non-blank refusal reason', () => {
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
    });

    budget.sendToCustomer();

    expect(() => budget.refuse('   ')).toThrow(DomainException);
  });

  it('does not allow answering, resending, or changing terminal budgets', () => {
    const acceptedBudget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
    });
    acceptedBudget.sendToCustomer();
    acceptedBudget.accept();

    expect(() => acceptedBudget.accept()).toThrow(DomainException);
    expect(() => acceptedBudget.refuse('Changed my mind')).toThrow(
      DomainException,
    );
    expect(() => acceptedBudget.sendToCustomer()).toThrow(DomainException);
    expect(() => acceptedBudget.addItem(serviceItem)).toThrow(DomainException);
    expect(() =>
      acceptedBudget.removeItem(acceptedBudget.getItems()[0].getId()),
    ).toThrow(DomainException);

    const refusedBudget = Budget.create({
      serviceOrderId: 'service-456',
      version: 1,
      items: [serviceItem],
    });
    refusedBudget.sendToCustomer();
    refusedBudget.refuse('Customer found it expensive');

    expect(() => refusedBudget.accept()).toThrow(DomainException);
    expect(() => refusedBudget.refuse('Another reason')).toThrow(
      DomainException,
    );
    expect(() => refusedBudget.sendToCustomer()).toThrow(DomainException);
    expect(() => refusedBudget.addItem(serviceItem)).toThrow(DomainException);
    expect(() =>
      refusedBudget.removeItem(refusedBudget.getItems()[0].getId()),
    ).toThrow(DomainException);
  });
});
