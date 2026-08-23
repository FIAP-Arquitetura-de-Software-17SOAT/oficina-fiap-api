import { PaymentMethod } from '../enums/payment-method.enum';
import { FakePaymentGateway } from './fake-payment.gateway';

describe('FakePaymentGateway', () => {
  it('creates deterministic test payment links', async () => {
    const gateway = new FakePaymentGateway();

    const result = await gateway.createPaymentLink({
      billingId: 'billing-1',
      serviceOrderId: 'service-order-1',
      amountInCents: 15000,
    });

    expect(result).toMatchObject({
      paymentLink: 'https://fake.stripe.test/checkout/billing-1',
      gatewayTransactionId: 'fake_session_billing-1',
    });
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('returns configured webhook payment result', async () => {
    const gateway = new FakePaymentGateway();
    gateway.queueWebhookResult({
      type: 'payment_confirmed',
      gatewayTransactionId: 'fake_session_billing-1',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await expect(
      gateway.parsePaymentWebhook({
        payload: Buffer.from('{}'),
        signature: 'test',
      }),
    ).resolves.toMatchObject({ type: 'payment_confirmed' });
  });
});
