import { Money } from '../../../../../shared/domain/value-objects/money.vo';
import { Budget, BudgetItemType } from '../../../domain/entities/budget.entity';
import {
  approvalPage,
  decisionResultPage,
  messagePage,
} from './approval-page.view';

const makeBudget = () =>
  Budget.create({
    serviceOrderId: 'so-<1>',
    version: 1,
    items: [
      {
        partId: 'part-1',
        description: 'Brake & pad',
        type: BudgetItemType.PART,
        quantity: 2,
        unitPrice: Money.fromDecimal(50),
      },
    ],
  });

describe('approval page views', () => {
  it('shows the two forms only while the budget waits for the customer', () => {
    const budget = makeBudget();
    budget.sendToClient();

    const html = approvalPage(budget, 'tok"en');

    expect(html).toContain('Orçamento da OS so-&lt;1&gt;');
    expect(html).toContain('Brake &amp; pad');
    expect(html).toContain('value="tok&quot;en"');
    expect(html.match(/<form/g)).toHaveLength(2);
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('tells an answered budget apart, approved or refused', () => {
    const budget = makeBudget();
    expect(approvalPage(budget, 't')).toContain('já foi recusado');

    budget.sendToClient();
    budget.accept();
    const html = approvalPage(budget, 't');
    expect(html).toContain('já foi aprovado');
    expect(html).not.toContain('<form');
  });

  it('renders the decision result and generic message pages', () => {
    const budget = makeBudget();
    budget.sendToClient();
    budget.refuse('Caro');
    expect(decisionResultPage(budget)).toContain('<h1>Orçamento recusado</h1>');

    const accepted = makeBudget();
    accepted.sendToClient();
    accepted.accept();
    expect(decisionResultPage(accepted)).toContain(
      '<h1>Orçamento aprovado</h1>',
    );

    expect(messagePage('Título <x>', 'Mensagem & tal')).toContain(
      '<h1>Título &lt;x&gt;</h1><p>Mensagem &amp; tal</p>',
    );
  });
});
