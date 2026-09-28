import { escapeHtml, paymentLinkReadyEmail } from './notification-templates';

describe('notification templates', () => {
  it('escapes HTML dynamic values', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
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
