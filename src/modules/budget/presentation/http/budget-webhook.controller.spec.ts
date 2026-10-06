import type { Response } from 'express';
import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { DomainException } from '../../../../shared/domain/domain.exception';
import { Budget, BudgetItemType } from '../../domain/entities/budget.entity';
import { BudgetDecision } from '../../application/contracts/budget.input';
import { BudgetApplicationError } from '../../application/errors/budget-application.error';
import { ApplyExternalDecisionUseCase } from '../../application/use-cases/apply-external-decision.use-case';
import { FindBudgetByApprovalTokenUseCase } from '../../application/use-cases/find-budget-by-approval-token.use-case';
import { BudgetWebhookController } from './budget-webhook.controller';

describe('BudgetWebhookController', () => {
  const findByToken = { execute: jest.fn() };
  const applyDecision = { execute: jest.fn() };
  const controller = new BudgetWebhookController(
    findByToken as unknown as FindBudgetByApprovalTokenUseCase,
    applyDecision as unknown as ApplyExternalDecisionUseCase,
  );
  const response = () => ({
    type: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(),
  });
  const asResponse = (res: ReturnType<typeof response>) =>
    res as unknown as Response;
  const token = 'A'.repeat(43);
  const budget = () => {
    const created = Budget.create({
      serviceOrderId: 'so-1',
      version: 1,
      items: [
        {
          description: 'Oil <change>',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: Money.fromDecimal(120),
        },
      ],
    });
    created.sendToClient();
    return created;
  };

  beforeEach(() => jest.resetAllMocks());

  it('renders the confirmation page with hardened headers', async () => {
    findByToken.execute.mockResolvedValue(budget());
    const res = response();

    const html = await controller.confirmationPage(token, asResponse(res));

    expect(html).toContain('Aprovar orçamento');
    expect(html).toContain('Oil &lt;change&gt;');
    expect(html).toContain(`value="${token}"`);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Referrer-Policy',
      'no-referrer',
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it.each([
    ['APPROVAL_LINK_INVALID', 404, 'Link inválido'],
    ['APPROVAL_LINK_EXPIRED', 410, 'Link vencido'],
    ['BUDGET_ALREADY_ANSWERED', 409, 'Orçamento já respondido'],
  ] as const)(
    'turns %s into a %s page titled "%s"',
    async (code, status, title) => {
      findByToken.execute.mockRejectedValue(new BudgetApplicationError(code));
      const res = response();

      const html = await controller.confirmationPage(
        undefined,
        asResponse(res),
      );

      expect(findByToken.execute).toHaveBeenCalledWith('');
      expect(res.status).toHaveBeenCalledWith(status);
      expect(html).toContain(`<h1>${title}</h1>`);
    },
  );

  it('falls back to a generic title for other application kinds', async () => {
    const res = response();

    // Nenhum código do módulo tem kind INVALID; forçamos um para cobrir o fallback.
    findByToken.execute.mockRejectedValue(
      Object.assign(new BudgetApplicationError('BUDGET_NOT_FOUND'), {
        kind: 'INVALID',
      }),
    );
    const html = await controller.confirmationPage(token, asResponse(res));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(html).toContain('<h1>Não foi possível concluir</h1>');
  });

  it('lets non-application errors reach the global filters', async () => {
    findByToken.execute.mockRejectedValue(new DomainException('boom'));

    await expect(
      controller.confirmationPage(token, asResponse(response())),
    ).rejects.toThrow('boom');
  });

  it('answers JSON to API clients and HTML to the browser form', async () => {
    const accepted = budget();
    accepted.accept();
    applyDecision.execute.mockResolvedValue(accepted);
    const dto = { token, decision: BudgetDecision.APPROVED };

    const json = await controller.receiveDecision(
      dto,
      'application/json',
      asResponse(response()),
    );
    expect(json).toMatchObject({ id: accepted.getId(), status: 'ACCEPTED' });

    const html = await controller.receiveDecision(
      dto,
      'text/html,*/*',
      asResponse(response()),
    );
    expect(html).toContain('<h1>Orçamento aprovado</h1>');
  });

  it('renders the refusal result and error pages for the form', async () => {
    const refused = budget();
    refused.refuse('Caro');
    applyDecision.execute.mockResolvedValueOnce(refused);
    const dto = { token, decision: BudgetDecision.REFUSED, reason: 'Caro' };

    const html = await controller.receiveDecision(
      dto,
      'text/html',
      asResponse(response()),
    );
    expect(html).toContain('<h1>Orçamento recusado</h1>');

    applyDecision.execute.mockRejectedValueOnce(
      new BudgetApplicationError('BUDGET_ALREADY_ANSWERED', { accepted: true }),
    );
    const res = response();
    const errorHtml = await controller.receiveDecision(
      dto,
      'text/html',
      asResponse(res),
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(errorHtml).toContain('O orçamento já foi aceito');
  });
});
