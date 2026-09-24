import { escapeHtml } from '../../../shared/notifications/email/notification-templates';
import { Budget, BudgetStatus } from '../entities/budget.entity';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function layout(title: string, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    'body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#1f2328}',
    'table{width:100%;border-collapse:collapse;margin:1rem 0}',
    'th,td{text-align:left;padding:.4rem;border-bottom:1px solid #d0d7de}',
    'form{margin:1rem 0}button{font-size:1rem;padding:.6rem 1.2rem;cursor:pointer}',
    'textarea{width:100%;min-height:4rem;margin:.4rem 0}',
    '</style></head><body>',
    body,
    '</body></html>',
  ].join('');
}

/**
 * Página que o link do email abre. Ela só mostra o orçamento: quem decide é o
 * POST dos botões. Um GET que aprovasse seria aprovado pelos scanners de
 * email, que abrem os links sozinhos para checar segurança.
 */
export function approvalPage(budget: Budget, token: string): string {
  const rows = budget
    .getItems()
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.getDescription())}</td><td>${item.getQuantity()}</td><td>${currency.format(item.getSubtotal().value)}</td></tr>`,
    )
    .join('');
  const header = [
    `<h1>Orçamento da OS ${escapeHtml(budget.getServiceOrderId())}</h1>`,
    '<table><thead><tr><th>Item</th><th>Qtd.</th><th>Subtotal</th></tr></thead>',
    `<tbody>${rows}</tbody></table>`,
    `<p><strong>Total: ${currency.format(budget.getTotal().value)}</strong></p>`,
  ].join('');

  if (budget.getStatus() !== BudgetStatus.WAITING_APPROVAL) {
    return layout(
      'Orçamento respondido',
      `${header}<p>Este orçamento já foi ${budget.getStatus() === BudgetStatus.ACCEPTED ? 'aprovado' : 'recusado'}.</p>`,
    );
  }

  const tokenInput = `<input type="hidden" name="token" value="${escapeHtml(token)}">`;

  return layout(
    'Aprovar orçamento',
    [
      header,
      '<form method="post" action="decision">',
      tokenInput,
      '<input type="hidden" name="decision" value="APPROVED">',
      '<button type="submit">Aprovar orçamento</button></form>',
      '<form method="post" action="decision">',
      tokenInput,
      '<input type="hidden" name="decision" value="REFUSED">',
      '<label for="reason">Motivo da recusa</label>',
      '<textarea id="reason" name="reason" required maxlength="500"></textarea>',
      '<button type="submit">Recusar orçamento</button></form>',
    ].join(''),
  );
}

export function decisionResultPage(budget: Budget): string {
  const accepted = budget.getStatus() === BudgetStatus.ACCEPTED;

  return layout(
    accepted ? 'Orçamento aprovado' : 'Orçamento recusado',
    accepted
      ? '<h1>Orçamento aprovado</h1><p>Obrigado! A oficina já foi avisada e vai seguir com o serviço.</p>'
      : '<h1>Orçamento recusado</h1><p>A oficina foi avisada e pode entrar em contato com uma nova proposta.</p>',
  );
}

export function messagePage(title: string, message: string): string {
  return layout(
    title,
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`,
  );
}
