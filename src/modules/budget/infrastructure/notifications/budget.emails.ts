import {
  EmailContent,
  escapeHtml,
} from '../../../../shared/notifications/email/notification-templates';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const quantity = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

export function budgetReadyEmail(input: {
  serviceOrderId: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  total: number;
  /** Link pessoal do cliente: abre a página que confirma a decisão. */
  approvalUrl: string;
  approvalExpiresAt: Date;
}): EmailContent {
  const textItems = input.items.map(
    (item) =>
      `- ${item.description} | Quantidade: ${quantity.format(item.quantity)} | Valor unitário: ${currency.format(item.unitPrice)} | Subtotal: ${currency.format(item.subtotal)}`,
  );
  const htmlItems = input.items.map(
    (item) =>
      `<tr><td>${escapeHtml(item.description)}</td><td>${quantity.format(item.quantity)}</td><td>${currency.format(item.unitPrice)}</td><td>${currency.format(item.subtotal)}</td></tr>`,
  );
  const total = currency.format(input.total);
  const expiresAt = date.format(input.approvalExpiresAt);

  return {
    subject: `Orçamento disponível para a OS ${input.serviceOrderId}`,
    text: [
      `Orçamento disponível para a ordem de serviço ${input.serviceOrderId}.`,
      '',
      'Itens:',
      ...textItems,
      '',
      `Total: ${total}`,
      '',
      `Para aprovar ou recusar: ${input.approvalUrl}`,
      `O link vale até ${expiresAt} e é pessoal: não o encaminhe.`,
    ].join('\n'),
    html: [
      `<p>Orçamento disponível para a ordem de serviço ${escapeHtml(input.serviceOrderId)}.</p>`,
      '<table><thead><tr><th>Item</th><th>Quantidade</th><th>Valor unitário</th><th>Subtotal</th></tr></thead><tbody>',
      ...htmlItems,
      `</tbody></table><p><strong>Total: ${total}</strong></p>`,
      `<p><a href="${escapeHtml(input.approvalUrl)}">Aprovar ou recusar o orçamento</a></p>`,
      `<p>O link vale até ${escapeHtml(expiresAt)} e é pessoal: não o encaminhe.</p>`,
    ].join(''),
  };
}

export function stockPartsRequestedEmail(input: {
  serviceOrderId: string;
  parts: { description: string; quantity: number }[];
}): EmailContent {
  const textParts = input.parts.map(
    (part) =>
      `- ${part.description} | Quantidade: ${quantity.format(part.quantity)}`,
  );
  const htmlParts = input.parts.map(
    (part) =>
      `<tr><td>${escapeHtml(part.description)}</td><td>${quantity.format(part.quantity)}</td></tr>`,
  );

  return {
    subject: `Peças solicitadas para a OS ${input.serviceOrderId}`,
    text: [
      `Peças solicitadas para a ordem de serviço ${input.serviceOrderId}.`,
      '',
      'Peças:',
      ...textParts,
    ].join('\n'),
    html: [
      `<p>Peças solicitadas para a ordem de serviço ${escapeHtml(input.serviceOrderId)}.</p>`,
      '<table><thead><tr><th>Peça</th><th>Quantidade</th></tr></thead><tbody>',
      ...htmlParts,
      '</tbody></table>',
    ].join(''),
  };
}
