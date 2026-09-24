import {
  budgetReadyEmail,
  escapeHtml,
  paymentLinkReadyEmail,
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
});
