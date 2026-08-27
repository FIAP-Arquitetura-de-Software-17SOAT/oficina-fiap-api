import { EmailMessage } from './email-sender';

interface BudgetItemEmailData {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface StockPartEmailData {
  description: string;
  quantity: number;
}

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const quantity = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
});

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

export function budgetReadyEmail(input: {
  serviceOrderId: string;
  items: BudgetItemEmailData[];
  total: number;
}): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const textItems = input.items.map(
    (item) =>
      `- ${item.description} | Quantidade: ${quantity.format(item.quantity)} | Valor unitário: ${currency.format(item.unitPrice)} | Subtotal: ${currency.format(item.subtotal)}`,
  );
  const htmlItems = input.items.map(
    (item) =>
      `<tr><td>${escapeHtml(item.description)}</td><td>${quantity.format(item.quantity)}</td><td>${currency.format(item.unitPrice)}</td><td>${currency.format(item.subtotal)}</td></tr>`,
  );
  const total = currency.format(input.total);

  return {
    subject: `Orçamento disponível para a OS ${input.serviceOrderId}`,
    text: [
      `Orçamento disponível para a ordem de serviço ${input.serviceOrderId}.`,
      '',
      'Itens:',
      ...textItems,
      '',
      `Total: ${total}`,
    ].join('\n'),
    html: [
      `<p>Orçamento disponível para a ordem de serviço ${escapeHtml(input.serviceOrderId)}.</p>`,
      '<table><thead><tr><th>Item</th><th>Quantidade</th><th>Valor unitário</th><th>Subtotal</th></tr></thead><tbody>',
      ...htmlItems,
      `</tbody></table><p><strong>Total: ${total}</strong></p>`,
    ].join(''),
  };
}

export function stockPartsRequestedEmail(input: {
  serviceOrderId: string;
  parts: StockPartEmailData[];
}): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
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

export function paymentLinkReadyEmail(input: {
  serviceOrderId: string;
  total: number;
  paymentLink: string;
}): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const total = currency.format(input.total);

  return {
    subject: `Link de pagamento disponível para a OS ${input.serviceOrderId}`,
    text: [
      `O serviço da ordem ${input.serviceOrderId} foi concluído.`,
      `Valor para pagamento: ${total}.`,
      '',
      `Pague pelo link: ${input.paymentLink}`,
    ].join('\n'),
    html: [
      `<p>O serviço da ordem ${escapeHtml(input.serviceOrderId)} foi concluído.</p>`,
      `<p>Valor para pagamento: <strong>${escapeHtml(total)}</strong>.</p>`,
      `<p><a href="${escapeHtml(input.paymentLink)}">Pagar agora</a></p>`,
    ].join(''),
  };
}
