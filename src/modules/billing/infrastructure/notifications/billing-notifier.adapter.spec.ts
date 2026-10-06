import { FindClientUseCase } from '../../../client/application/use-cases/find-client.use-case';
import { EnqueueNotificationUseCase } from '../../../notification/application/use-cases/enqueue-notification.use-case';
import { FindServiceOrderUseCase } from '../../../service-order/application/use-cases/find-service-order.use-case';
import { BillingNotifierAdapter } from './billing-notifier.adapter';
import { paymentLinkReadyEmail } from './payment-link-ready.email';

describe('paymentLinkReadyEmail', () => {
  it('builds an escaped payment-link email', () => {
    const message = paymentLinkReadyEmail({
      serviceOrderId: 'os-<123>',
      total: 150,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123?a=<1>',
    });

    expect(message.subject).toBe(
      'Link de pagamento disponível para a OS os-<123>',
    );
    // O Intl separa "R$" do valor com espaço não separável.
    expect(message.text).toMatch(/R\$\s150,00/);
    expect(message.text).toContain(
      'Pague pelo link: https://checkout.stripe.com/c/pay/cs_test_123?a=<1>',
    );
    expect(message.html).toContain('os-&lt;123&gt;');
    expect(message.html).toContain(
      'href="https://checkout.stripe.com/c/pay/cs_test_123?a=&lt;1&gt;"',
    );
  });
});

describe('BillingNotifierAdapter', () => {
  const findServiceOrder = { execute: jest.fn() };
  const findClient = { execute: jest.fn() };
  const notifications = { execute: jest.fn() };
  const adapter = new BillingNotifierAdapter(
    findServiceOrder as unknown as FindServiceOrderUseCase,
    findClient as unknown as FindClientUseCase,
    notifications as unknown as EnqueueNotificationUseCase,
  );
  const notice = {
    serviceOrderId: 'so-1',
    total: 150,
    paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_456',
  };

  beforeEach(() => jest.resetAllMocks());

  it('queues the payment link for the service-order customer', async () => {
    findServiceOrder.execute.mockResolvedValue({ getClientId: () => 'c-1' });
    findClient.execute.mockResolvedValue({
      getEmail: () => ({ getValue: () => 'maria@example.com' }),
    });
    notifications.execute.mockResolvedValue(undefined);

    await adapter.paymentLinkReady(notice);

    expect(findClient.execute).toHaveBeenCalledWith('c-1');
    expect(notifications.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PAYMENT_LINK_READY',
        to: 'maria@example.com',
        text: expect.stringContaining(notice.paymentLink),
        html: expect.stringMatching(/R\$\s150,00/),
      }),
    );
  });

  it('never throws when the client lookup or the queue fails', async () => {
    findServiceOrder.execute.mockRejectedValueOnce(new Error('db down'));
    await expect(adapter.paymentLinkReady(notice)).resolves.toBeUndefined();

    findServiceOrder.execute.mockResolvedValue({ getClientId: () => 'c-1' });
    findClient.execute.mockResolvedValue({
      getEmail: () => ({ getValue: () => 'maria@example.com' }),
    });
    notifications.execute.mockRejectedValue(new Error('queue unavailable'));
    await expect(adapter.paymentLinkReady(notice)).resolves.toBeUndefined();
  });
});
