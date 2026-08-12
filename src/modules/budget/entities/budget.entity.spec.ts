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
  });

  it('refuses only budgets waiting for approval and stores refusal reason', () => {
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [serviceItem],
    });

    budget.sendToCustomer();
    budget.refuse('Customer found it expensive');

    expect(budget.getStatus()).toBe(BudgetStatus.REFUSED);
    expect(budget.getRefusalReason()).toBe('Customer found it expensive');
  });
});
