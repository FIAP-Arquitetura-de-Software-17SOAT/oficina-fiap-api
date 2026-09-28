import { BadRequestException } from '@nestjs/common';
import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { ServiceOrderStatus } from '../../../service-order/domain/enums/service-order-status.enum';
import { ConfirmPaymentReturnUseCase } from '../../application/use-cases/confirm-payment-return.use-case';
import { RegisterPaymentCancellationUseCase } from '../../application/use-cases/register-payment-cancellation.use-case';
import { Billing } from '../../domain/entities/billing.entity';
import { BillingStatus } from '../../domain/enums/billing-status.enum';
import { PaymentController } from './payment.controller';

const billingId = 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const paymentReturn = (
  billingStatus: BillingStatus,
  serviceOrderStatus: ServiceOrderStatus,
) => ({
  billing: Billing.restore(billingId, {
    serviceOrderId,
    budgetId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    amount: Money.fromCents(15000),
    status: billingStatus,
    paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_return',
    gatewayTransactionId: 'cs_test_return',
  }),
  serviceOrder: {
    id: serviceOrderId,
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    status: serviceOrderStatus,
  },
});

describe('PaymentController', () => {
  let service: {
    confirmPaymentReturn: jest.Mock;
    registerPaymentCancellation: jest.Mock;
  };
  let controller: PaymentController;

  beforeEach(() => {
    service = {
      confirmPaymentReturn: jest.fn(),
      registerPaymentCancellation: jest.fn(),
    };
    controller = new PaymentController(
      {
        execute: service.confirmPaymentReturn,
      } as unknown as ConfirmPaymentReturnUseCase,
      {
        execute: service.registerPaymentCancellation,
      } as unknown as RegisterPaymentCancellationUseCase,
    );
  });

  it('responde o estado da cobrança e da OS no retorno de sucesso', async () => {
    service.confirmPaymentReturn.mockResolvedValue(
      paymentReturn(BillingStatus.PAID, ServiceOrderStatus.DELIVERED),
    );

    await expect(controller.success('cs_test_return')).resolves.toEqual({
      billingId,
      serviceOrderId,
      billingStatus: BillingStatus.PAID,
      serviceOrderStatus: ServiceOrderStatus.DELIVERED,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_return',
    });
    expect(service.confirmPaymentReturn).toHaveBeenCalledWith('cs_test_return');
  });

  it('recusa retorno de sucesso sem session_id', async () => {
    await expect(controller.success('  ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.confirmPaymentReturn).not.toHaveBeenCalled();
  });

  it('responde a OS com cobrança em aberto no retorno de cancelamento', async () => {
    service.registerPaymentCancellation.mockResolvedValue(
      paymentReturn(
        BillingStatus.WAITING_PAYMENT,
        ServiceOrderStatus.AWAITING_PAYMENT,
      ),
    );

    await expect(controller.cancel(billingId)).resolves.toMatchObject({
      billingStatus: BillingStatus.WAITING_PAYMENT,
      serviceOrderStatus: ServiceOrderStatus.AWAITING_PAYMENT,
    });
    expect(service.registerPaymentCancellation).toHaveBeenCalledWith(billingId);
  });
});
