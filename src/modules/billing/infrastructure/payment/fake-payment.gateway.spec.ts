import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { FakePaymentGateway } from './fake-payment.gateway';

describe('FakePaymentGateway', () => {
  it('creates deterministic test payment links', async () => {
    const gateway = new FakePaymentGateway();

    const result = await gateway.createPaymentLink({
      billingId: 'billing-1',
      serviceOrderId: 'service-order-1',
      amountInCents: 15000,
      idempotencyKey: 'billing-payment-link:billing-1:attempt-1',
    });

    expect(result).toMatchObject({
      paymentLink:
        'https://fake.stripe.test/checkout/billing-payment-link:billing-1:attempt-1',
      gatewayTransactionId:
        'fake_session_billing-payment-link:billing-1:attempt-1',
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

  it('ignores a webhook when nothing was queued', async () => {
    const gateway = new FakePaymentGateway();

    await expect(
      gateway.parsePaymentWebhook({ payload: '{}', signature: 'test' }),
    ).resolves.toMatchObject({ type: 'ignored' });
  });

  it('reports a session as paid only after it was marked so', async () => {
    const gateway = new FakePaymentGateway();

    await expect(gateway.getPaymentStatus('fake_session_1')).resolves.toEqual({
      status: 'unpaid',
      gatewayTransactionId: 'fake_session_1',
    });

    gateway.markSessionPaid({
      status: 'paid',
      gatewayTransactionId: 'fake_session_1',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });
    await expect(
      gateway.getPaymentStatus('fake_session_1'),
    ).resolves.toMatchObject({ status: 'paid', method: PaymentMethod.CARD });
  });
});
