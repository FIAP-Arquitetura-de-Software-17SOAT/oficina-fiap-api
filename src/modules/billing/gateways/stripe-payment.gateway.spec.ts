import { PaymentMethod } from '../enums/payment-method.enum';
import { InvalidPaymentWebhookSignatureError } from './payment-gateway';
import { StripePaymentGateway } from './stripe-payment.gateway';

const mockCreateCheckoutSession = jest.fn();
const mockRetrieveCheckoutSession = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockCreateCheckoutSession,
        retrieve: mockRetrieveCheckoutSession,
      },
    },
    webhooks: { constructEvent: mockConstructEvent },
  })),
}));

describe('StripePaymentGateway', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
    process.env.PAYMENT_SUCCESS_URL = 'https://example.test/payment/success';
    process.env.PAYMENT_CANCEL_URL = 'https://example.test/payment/cancel';
    jest.clearAllMocks();
  });

  it('creates a BRL payment Checkout Session with billing metadata', async () => {
    mockCreateCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      expires_at: 1787479200,
    });
    const gateway = new StripePaymentGateway();

    const result = await gateway.createPaymentLink({
      billingId: 'billing-1',
      serviceOrderId: 'service-order-1',
      amountInCents: 15000,
      idempotencyKey: 'billing-payment-link:billing-1:attempt-1',
    });

    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: 'billing-1',
        metadata: {
          billingId: 'billing-1',
          serviceOrderId: 'service-order-1',
        },
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: 'brl',
              unit_amount: 15000,
            }),
          }),
        ],
      }),
      { idempotencyKey: 'billing-payment-link:billing-1:attempt-1' },
    );
    expect(result).toEqual({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-23T10:00:00.000Z'),
    });
  });

  it('rejects a Checkout Session without a payment URL', async () => {
    mockCreateCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: null,
      expires_at: 1787479200,
    });
    const gateway = new StripePaymentGateway();

    await expect(
      gateway.createPaymentLink({
        billingId: 'billing-1',
        serviceOrderId: 'service-order-1',
        amountInCents: 15000,
        idempotencyKey: 'billing-payment-link:billing-1:attempt-2',
      }),
    ).rejects.toThrow('Stripe Checkout Session URL is required');
  });

  it('maps a completed Checkout Session webhook to a card payment', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      created: 1787392800,
      data: { object: { id: 'cs_test_123', payment_status: 'paid' } },
    });
    const gateway = new StripePaymentGateway();

    await expect(
      gateway.parsePaymentWebhook({
        payload: Buffer.from('{}'),
        signature: 'stripe-signature',
      }),
    ).resolves.toEqual({
      type: 'payment_confirmed',
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });
    expect(mockConstructEvent).toHaveBeenCalledWith(
      expect.any(Buffer),
      'stripe-signature',
      'whsec_test_123',
    );
  });

  it('ignores a completed Checkout Session when payment is not paid', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      created: 1787392800,
      data: { object: { id: 'cs_test_123', payment_status: 'unpaid' } },
    });
    const gateway = new StripePaymentGateway();

    await expect(
      gateway.parsePaymentWebhook({
        payload: Buffer.from('{}'),
        signature: 'stripe-signature',
      }),
    ).resolves.toEqual({
      type: 'ignored',
      reason: 'Checkout Session payment is not paid',
    });
  });

  it('translates Stripe signature verification failures', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw Object.assign(new Error('No signatures found'), {
        type: 'StripeSignatureVerificationError',
      });
    });
    const gateway = new StripePaymentGateway();

    await expect(
      gateway.parsePaymentWebhook({
        payload: Buffer.from('{}'),
        signature: 'invalid-signature',
      }),
    ).rejects.toThrow(InvalidPaymentWebhookSignatureError);
  });

  it('does not hide non-signature Stripe failures', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Stripe unavailable');
    });
    const gateway = new StripePaymentGateway();

    await expect(
      gateway.parsePaymentWebhook({
        payload: Buffer.from('{}'),
        signature: 'stripe-signature',
      }),
    ).rejects.toThrow('Stripe unavailable');
  });

  it('rejects a live Stripe secret key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_123';

    expect(() => new StripePaymentGateway()).toThrow(
      'STRIPE_SECRET_KEY must be a Stripe test key',
    );
  });

  it('carrega as URLs de retorno com o que cada uma precisa para ser identificada', async () => {
    mockCreateCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      expires_at: 1787479200,
    });
    const gateway = new StripePaymentGateway();

    await gateway.createPaymentLink({
      billingId: 'billing-1',
      serviceOrderId: 'service-order-1',
      amountInCents: 15000,
      idempotencyKey: 'billing-payment-link:billing-1:attempt-1',
    });

    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        // O Stripe só substitui o template na success_url; a cancel_url leva o
        // id da cobrança porque o id da sessão ainda não existe aqui.
        success_url:
          'https://example.test/payment/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://example.test/payment/cancel?billing_id=billing-1',
      }),
      expect.anything(),
    );
  });

  it('preserva query string já existente nas URLs de retorno', async () => {
    process.env.PAYMENT_SUCCESS_URL = 'https://example.test/pay?origin=app';
    process.env.PAYMENT_CANCEL_URL = 'https://example.test/pay?origin=app';
    mockCreateCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      expires_at: 1787479200,
    });
    const gateway = new StripePaymentGateway();

    await gateway.createPaymentLink({
      billingId: 'billing-1',
      serviceOrderId: 'service-order-1',
      amountInCents: 15000,
      idempotencyKey: 'billing-payment-link:billing-1:attempt-1',
    });

    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url:
          'https://example.test/pay?origin=app&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://example.test/pay?origin=app&billing_id=billing-1',
      }),
      expect.anything(),
    );
  });

  it('lê no Stripe se a Checkout Session foi paga', async () => {
    mockRetrieveCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
    });
    const gateway = new StripePaymentGateway();

    await expect(
      gateway.getPaymentStatus('cs_test_123'),
    ).resolves.toMatchObject({
      status: 'paid',
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
    });
    expect(mockRetrieveCheckoutSession).toHaveBeenCalledWith('cs_test_123');
  });

  it('reporta sessão não paga sem inventar pagamento', async () => {
    mockRetrieveCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'unpaid',
    });
    const gateway = new StripePaymentGateway();

    await expect(gateway.getPaymentStatus('cs_test_123')).resolves.toEqual({
      status: 'unpaid',
      gatewayTransactionId: 'cs_test_123',
    });
  });
});
