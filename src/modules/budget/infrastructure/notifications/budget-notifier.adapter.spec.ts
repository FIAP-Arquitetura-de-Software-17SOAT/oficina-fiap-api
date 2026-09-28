import { ConfigService } from '@nestjs/config';
import { FindClientUseCase } from '../../../client/application/use-cases/find-client.use-case';
import { EnqueueNotificationUseCase } from '../../../notification/application/use-cases/enqueue-notification.use-case';
import { FindServiceOrderUseCase } from '../../../service-order/application/use-cases/find-service-order.use-case';
import { BudgetNotifierAdapter } from './budget-notifier.adapter';
import { budgetReadyEmail, stockPartsRequestedEmail } from './budget.emails';

describe('budget e-mails', () => {
  it('builds an escaped budget-ready email', () => {
    const message = budgetReadyEmail({
      serviceOrderId: 'os-<123>',
      items: [
        {
          description: '<Brake & oil>',
          quantity: 1,
          unitPrice: 100,
          subtotal: 100,
        },
      ],
      total: 100,
      approvalUrl: 'https://oficina.example/aprovar?token=<abc>',
      approvalExpiresAt: new Date('2026-09-08T12:00:00Z'),
    });

    expect(message.subject).toBe('Orçamento disponível para a OS os-<123>');
    expect(message.text).toContain('<Brake & oil>');
    expect(message.html).toContain('os-&lt;123&gt;');
    expect(message.html).toContain('&lt;Brake &amp; oil&gt;');
  });

  it('carries the approval link, escaped, and when it expires', () => {
    const message = budgetReadyEmail({
      serviceOrderId: 'os-123',
      items: [{ description: 'Oil', quantity: 1, unitPrice: 1, subtotal: 1 }],
      total: 1,
      approvalUrl: 'https://oficina.example/aprovar?token=abc&x=<1>',
      approvalExpiresAt: new Date('2026-09-08T12:00:00Z'),
    });

    expect(message.text).toContain(
      'Para aprovar ou recusar: https://oficina.example/aprovar?token=abc&x=<1>',
    );
    expect(message.text).toContain('O link vale até 08/09/2026');
    expect(message.html).toContain(
      'href="https://oficina.example/aprovar?token=abc&amp;x=&lt;1&gt;"',
    );
  });

  it('builds an escaped stock-parts email', () => {
    const message = stockPartsRequestedEmail({
      serviceOrderId: 'os-123',
      parts: [{ description: '<Brake pad>', quantity: 2 }],
    });

    expect(message.text).toContain('Quantidade: 2');
    expect(message.html).toContain('&lt;Brake pad&gt;');
  });
});

describe('BudgetNotifierAdapter', () => {
  const config = { get: jest.fn() };
  const findServiceOrder = { execute: jest.fn() };
  const findClient = { execute: jest.fn() };
  const notifications = { execute: jest.fn() };
  const adapter = new BudgetNotifierAdapter(
    config as unknown as ConfigService,
    findServiceOrder as unknown as FindServiceOrderUseCase,
    findClient as unknown as FindClientUseCase,
    notifications as unknown as EnqueueNotificationUseCase,
  );
  const readyNotice = {
    serviceOrderId: 'so-1',
    items: [{ description: 'Oil', quantity: 1, unitPrice: 120, subtotal: 120 }],
    total: 120,
    approvalToken: 'A'.repeat(43),
    approvalExpiresAt: new Date('2026-09-08T12:00:00Z'),
  };

  beforeEach(() => jest.resetAllMocks());

  it('emails the client with the personal approval link built from PUBLIC_API_URL', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'PUBLIC_API_URL' ? 'https://oficina.example/' : undefined,
    );
    findServiceOrder.execute.mockResolvedValue({ getClientId: () => 'c-1' });
    findClient.execute.mockResolvedValue({
      getEmail: () => ({ getValue: () => 'maria@example.com' }),
    });
    notifications.execute.mockResolvedValue(undefined);

    await adapter.budgetReady(readyNotice);

    expect(findClient.execute).toHaveBeenCalledWith('c-1');
    expect(notifications.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BUDGET_READY',
        to: 'maria@example.com',
        text: expect.stringContaining(
          `https://oficina.example/api/v1/budgets/webhooks/decision?token=${'A'.repeat(43)}`,
        ),
      }),
    );
  });

  it('falls back to localhost when PUBLIC_API_URL is missing and never throws', async () => {
    config.get.mockReturnValue(undefined);
    findServiceOrder.execute.mockResolvedValue({ getClientId: () => 'c-1' });
    findClient.execute.mockResolvedValue({
      getEmail: () => ({ getValue: () => 'maria@example.com' }),
    });
    notifications.execute.mockResolvedValue(undefined);

    await adapter.budgetReady(readyNotice);

    expect(notifications.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('http://localhost:3000/api/v1/budgets'),
      }),
    );

    findServiceOrder.execute.mockRejectedValue(new Error('db down'));
    await expect(adapter.budgetReady(readyNotice)).resolves.toBeUndefined();
  });

  it('emails the stock mailbox only when it is a valid address', async () => {
    notifications.execute.mockResolvedValue(undefined);
    const notice = {
      serviceOrderId: 'so-1',
      parts: [{ description: 'Brake pad', quantity: 2 }],
    };

    config.get.mockReturnValue('not-an-email');
    await adapter.stockPartsRequested(notice);
    expect(notifications.execute).not.toHaveBeenCalled();

    config.get.mockReturnValue('estoque@example.com');
    await adapter.stockPartsRequested(notice);
    expect(notifications.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STOCK_PARTS_REQUESTED',
        to: 'estoque@example.com',
        text: expect.stringContaining('Brake pad'),
      }),
    );
  });

  it('swallows a queue failure on the stock notice', async () => {
    config.get.mockReturnValue('estoque@example.com');
    notifications.execute.mockRejectedValue(new Error('queue unavailable'));

    await expect(
      adapter.stockPartsRequested({ serviceOrderId: 'so-1', parts: [] }),
    ).resolves.toBeUndefined();
  });
});
