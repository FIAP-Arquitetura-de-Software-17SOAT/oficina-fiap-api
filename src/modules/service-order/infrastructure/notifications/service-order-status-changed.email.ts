import { EmailContent } from '../../../../shared/infrastructure/email/email-content';
import { escapeHtml } from '../../../../shared/infrastructure/html/escape-html';

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Recebida',
  IN_DIAGNOSIS: 'Em diagnóstico',
  AWAITING_APPROVAL: 'Aguardando aprovação',
  AWAITING_PARTS: 'Aguardando peças',
  IN_PROGRESS: 'Em execução',
  COMPLETED: 'Finalizada',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelada',
};

export function serviceOrderStatusChangedEmail(input: {
  serviceOrderId: string;
  status: string;
  cancellationReason?: string | null;
}): EmailContent {
  const label = STATUS_LABELS[input.status] ?? input.status;
  const reason = input.cancellationReason
    ? `Motivo: ${input.cancellationReason}`
    : null;

  return {
    subject: `A OS ${input.serviceOrderId} está ${label}`,
    text: [
      `A ordem de serviço ${input.serviceOrderId} mudou de status.`,
      `Status atual: ${label}`,
      ...(reason ? [reason] : []),
    ].join('\n'),
    html: [
      `<p>A ordem de serviço ${escapeHtml(input.serviceOrderId)} mudou de status.</p>`,
      `<p>Status atual: <strong>${escapeHtml(label)}</strong></p>`,
      ...(reason ? [`<p>${escapeHtml(reason)}</p>`] : []),
    ].join(''),
  };
}
