import { Money } from '../../../../../shared/domain/value-objects/money.vo';
import { Budget, BudgetItemType } from '../../../domain/entities/budget.entity';
import { BudgetResponseMapper } from './budget-response.mapper';

describe('BudgetResponseMapper', () => {
  it('flattens the budget with decimal money and calculated totals', () => {
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

    const [response] = BudgetResponseMapper.toResponseList([budget]);

    expect(response).toMatchObject({
      id: budget.getId(),
      version: 1,
      status: 'GENERATED',
      totalAmount: 100,
      refusalReason: null,
      items: [
        expect.objectContaining({
          description: 'Oil change',
          quantity: 2,
          unitPrice: 50,
          subtotal: 100,
        }),
      ],
    });
    expect(JSON.stringify(response)).not.toContain('approvalToken');
  });
});
