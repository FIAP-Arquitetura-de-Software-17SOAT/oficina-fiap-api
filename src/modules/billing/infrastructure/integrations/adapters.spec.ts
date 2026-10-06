import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { FindAcceptedBudgetUseCase } from '../../../budget/application/use-cases/find-accepted-budget.use-case';
import { ServiceOrderApplicationError } from '../../../service-order/application/errors/service-order-application.error';
import { AwaitPaymentUseCase } from '../../../service-order/application/use-cases/await-payment.use-case';
import { DeliverServiceOrderUseCase } from '../../../service-order/application/use-cases/deliver-service-order.use-case';
import { FindServiceOrderUseCase } from '../../../service-order/application/use-cases/find-service-order.use-case';
import { AcceptedBudgetAdapter } from './accepted-budget.adapter';
import { ServiceOrderAdapter } from './service-order.adapter';

const serviceOrderLike = (status: string) => ({
  getId: () => 'so-1',
  getClientId: () => 'c-1',
  getStatus: () => status,
});

describe('billing adapters', () => {
  describe('ServiceOrderAdapter', () => {
    const find = { execute: jest.fn() };
    const awaitPayment = { execute: jest.fn() };
    const deliver = { execute: jest.fn() };
    const adapter = new ServiceOrderAdapter(
      find as unknown as FindServiceOrderUseCase,
      awaitPayment as unknown as AwaitPaymentUseCase,
      deliver as unknown as DeliverServiceOrderUseCase,
    );

    it('projects the service order and turns not-found into null', async () => {
      find.execute.mockResolvedValueOnce(serviceOrderLike('COMPLETED'));
      await expect(adapter.findById('so-1')).resolves.toEqual({
        id: 'so-1',
        clientId: 'c-1',
        status: 'COMPLETED',
      });

      find.execute.mockRejectedValueOnce(
        new ServiceOrderApplicationError('SERVICE_ORDER_NOT_FOUND'),
      );
      await expect(adapter.findById('missing')).resolves.toBeNull();

      find.execute.mockRejectedValueOnce(new Error('db down'));
      await expect(adapter.findById('so-1')).rejects.toThrow('db down');
    });

    it('forwards the transitions and projects their result', async () => {
      awaitPayment.execute.mockResolvedValue(
        serviceOrderLike('AWAITING_PAYMENT'),
      );
      deliver.execute.mockResolvedValue(serviceOrderLike('DELIVERED'));

      await expect(adapter.awaitPayment('so-1')).resolves.toMatchObject({
        status: 'AWAITING_PAYMENT',
      });
      await expect(adapter.deliver('so-1')).resolves.toMatchObject({
        status: 'DELIVERED',
      });
      expect(awaitPayment.execute).toHaveBeenCalledWith('so-1');
      expect(deliver.execute).toHaveBeenCalledWith('so-1');
    });
  });

  describe('AcceptedBudgetAdapter', () => {
    it('projects the accepted budget onto id and total, or null', async () => {
      const find = { execute: jest.fn() };
      const adapter = new AcceptedBudgetAdapter(
        find as unknown as FindAcceptedBudgetUseCase,
      );

      find.execute.mockResolvedValueOnce({
        getId: () => 'b-1',
        getTotal: () => Money.fromCents(15000),
      });
      await expect(adapter.findAccepted('so-1')).resolves.toEqual({
        id: 'b-1',
        total: Money.fromCents(15000),
      });

      find.execute.mockResolvedValueOnce(null);
      await expect(adapter.findAccepted('so-1')).resolves.toBeNull();
    });
  });
});
