import { BadRequestException } from '@nestjs/common';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { ServiceOrderStatus } from '../../service-order/enums/service-order-status.enum';
import { Billing } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import { BillingService } from '../services/billing.service';
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
  serviceOrder: ServiceOrder.restore(serviceOrderId, {
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Troca de óleo',
    status: serviceOrderStatus,
  }),
});

describe('PaymentController', () => {
  let service: jest.Mocked<BillingService>;
  let controller: PaymentController;

  beforeEach(() => {
    service = {
      confirmPaymentReturn: jest.fn(),
      registerPaymentCancellation: jest.fn(),
    } as unknown as jest.Mocked<BillingService>;
    controller = new PaymentController(service);
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
