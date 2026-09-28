import { escapeHtml } from './notification-templates';

describe('notification templates', () => {
  it('escapes HTML dynamic values', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
