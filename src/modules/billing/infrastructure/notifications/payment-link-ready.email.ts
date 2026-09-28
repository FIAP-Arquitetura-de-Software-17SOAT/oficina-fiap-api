import { EmailContent } from '../../../../shared/infrastructure/email/email-content';
import { escapeHtml } from '../../../../shared/infrastructure/html/escape-html';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function paymentLinkReadyEmail(input: {
  serviceOrderId: string;
  total: number;
  paymentLink: string;
}): EmailContent {
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
