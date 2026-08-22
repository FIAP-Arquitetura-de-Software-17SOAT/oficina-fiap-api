import { PaymentMethod } from '../enums/payment-method.enum';
import { StripePaymentGateway } from './stripe-payment.gateway';

const mockCreateCheckoutSession = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCreateCheckoutSession } },
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

  it('rejects a live Stripe secret key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_123';

    expect(() => new StripePaymentGateway()).toThrow(
      'STRIPE_SECRET_KEY must be a Stripe test key',
    );
  });
});
