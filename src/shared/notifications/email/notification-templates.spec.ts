import {
  budgetReadyEmail,
  escapeHtml,
  paymentLinkReadyEmail,
  serviceOrderStatusChangedEmail,
  stockPartsRequestedEmail,
} from './notification-templates';

describe('notification templates', () => {
  it('escapes HTML dynamic values', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

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
    });

    expect(message.subject).toBe('Orçamento disponível para a OS os-<123>');
    expect(message.text).toContain('<Brake & oil>');
    expect(message.html).toContain('os-&lt;123&gt;');
    expect(message.html).toContain('&lt;Brake &amp; oil&gt;');
  });

  it('builds an escaped stock-parts email', () => {
    const message = stockPartsRequestedEmail({
      serviceOrderId: 'os-123',
      parts: [{ description: '<Brake pad>', quantity: 2 }],
    });

    expect(message.text).toContain('Quantidade: 2');
    expect(message.html).toContain('&lt;Brake pad&gt;');
  });

  it('builds an escaped payment-link email', () => {
    const message = paymentLinkReadyEmail({
      serviceOrderId: 'os-<123>',
      total: 150,
      paymentLink: 'https://example.com/?q=<payment>',
    });

    expect(message.text).toContain('https://example.com/?q=<payment>');
    expect(message.html).toContain('os-&lt;123&gt;');
    expect(message.html).toContain('q=&lt;payment&gt;');
  });

  it('builds an escaped service-order-status email with the status label', () => {
    const message = serviceOrderStatusChangedEmail({
      serviceOrderId: 'os-<123>',
      status: 'IN_PROGRESS',
    });

    expect(message.subject).toBe('A OS os-<123> está Em execução');
    expect(message.text).toContain('Status atual: Em execução');
    expect(message.html).toContain('os-&lt;123&gt;');
    expect(message.html).toContain('<strong>Em execução</strong>');
  });

  it('adds the cancellation reason when there is one', () => {
    const message = serviceOrderStatusChangedEmail({
      serviceOrderId: 'os-123',
      status: 'CANCELLED',
      cancellationReason: '<Cliente desistiu>',
    });

    expect(message.text).toContain('Motivo: <Cliente desistiu>');
    expect(message.html).toContain('Motivo: &lt;Cliente desistiu&gt;');
  });
});
