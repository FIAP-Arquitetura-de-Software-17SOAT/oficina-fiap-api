import { FindClientUseCase } from '../../../client/application/use-cases/find-client.use-case';
import { EnqueueNotificationUseCase } from '../../../notification/application/use-cases/enqueue-notification.use-case';
import { ServiceOrderNotifierAdapter } from './service-order-notifier.adapter';
import { serviceOrderStatusChangedEmail } from './service-order-status-changed.email';

describe('serviceOrderStatusChangedEmail', () => {
  it('builds an escaped status e-mail with the status label', () => {
    const message = serviceOrderStatusChangedEmail({
      serviceOrderId: '<os-1>',
      status: 'IN_PROGRESS',
    });

    expect(message.subject).toBe('A OS <os-1> está Em execução');
    expect(message.text).toContain('Status atual: Em execução');
    expect(message.html).toContain('&lt;os-1&gt;');
    expect(message.html).toContain('<strong>Em execução</strong>');
  });

  it('adds the cancellation reason when there is one', () => {
    const message = serviceOrderStatusChangedEmail({
      serviceOrderId: 'os-1',
      status: 'CANCELLED',
      cancellationReason: 'Cliente <desistiu>',
    });

    expect(message.subject).toBe('A OS os-1 está Cancelada');
    expect(message.text).toContain('Motivo: Cliente <desistiu>');
    expect(message.html).toContain('Motivo: Cliente &lt;desistiu&gt;');
  });

  it('falls back to the raw status when there is no label', () => {
    expect(
      serviceOrderStatusChangedEmail({ serviceOrderId: 'os', status: 'X' })
        .subject,
    ).toBe('A OS os está X');
  });
});

describe('ServiceOrderNotifierAdapter', () => {
  const findClient = { execute: jest.fn() };
  const notifications = { execute: jest.fn() };
  const adapter = new ServiceOrderNotifierAdapter(
    findClient as unknown as FindClientUseCase,
    notifications as unknown as EnqueueNotificationUseCase,
  );

  beforeEach(() => jest.resetAllMocks());

  it('resolves the client e-mail and enqueues the status message', async () => {
    findClient.execute.mockResolvedValue({
      getEmail: () => ({ getValue: () => 'maria@example.com' }),
    });
    notifications.execute.mockResolvedValue(undefined);

    await adapter.statusChanged({
      clientId: 'c-1',
      serviceOrderId: 'os-1',
      status: 'CANCELLED',
      cancellationReason: 'Desistiu',
    });

    expect(findClient.execute).toHaveBeenCalledWith('c-1');
    expect(notifications.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SERVICE_ORDER_STATUS_CHANGED',
        to: 'maria@example.com',
        subject: 'A OS os-1 está Cancelada',
      }),
    );
  });

  it('never throws when the client lookup fails', async () => {
    findClient.execute.mockRejectedValue(new Error('db down'));

    await expect(
      adapter.statusChanged({
        clientId: 'c-1',
        serviceOrderId: 'os-1',
        status: 'COMPLETED',
        cancellationReason: null,
      }),
    ).resolves.toBeUndefined();
    expect(notifications.execute).not.toHaveBeenCalled();
  });
});
