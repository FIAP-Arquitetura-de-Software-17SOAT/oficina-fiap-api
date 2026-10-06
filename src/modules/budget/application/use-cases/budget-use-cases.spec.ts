import { Money } from '../../../../shared/domain/value-objects/money.vo';
import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../../domain/entities/budget.entity';
import { ApprovalToken } from '../../domain/value-objects/approval-token.vo';
import {
  BudgetDecision,
  CreateBudgetItemInput,
} from '../contracts/budget.input';
import { BudgetApplicationError } from '../errors/budget-application.error';
import {
  BudgetNotifierPort,
  BudgetReadyNotice,
  StockPartsRequestedNotice,
} from '../ports/budget-notifier.port';
import { BudgetRepositoryPort } from '../ports/budget-repository.port';
import {
  ServiceOrderPort,
  ServiceOrderSummary,
} from '../ports/service-order.port';
import { BudgetItemReferences } from '../services/budget-item-references';
import { BudgetStore } from '../services/budget-store';
import { AcceptBudgetUseCase } from './accept-budget.use-case';
import { AddBudgetItemUseCase } from './add-budget-item.use-case';
import { ApplyExternalDecisionUseCase } from './apply-external-decision.use-case';
import { CalculateBudgetTotalUseCase } from './calculate-budget-total.use-case';
import { CreateBudgetUseCase } from './create-budget.use-case';
import { FindAcceptedBudgetUseCase } from './find-accepted-budget.use-case';
import { FindBudgetByApprovalTokenUseCase } from './find-budget-by-approval-token.use-case';
import { FindBudgetUseCase } from './find-budget.use-case';
import { ListBudgetsByServiceOrderUseCase } from './list-budgets-by-service-order.use-case';
import { ListBudgetsUseCase } from './list-budgets.use-case';
import { RefuseBudgetUseCase } from './refuse-budget.use-case';
import { RemoveBudgetItemUseCase } from './remove-budget-item.use-case';
import { SendBudgetUseCase } from './send-budget.use-case';

const SERVICE_ORDER_ID = '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b';

/**
 * Repositório em memória com o mesmo compare-and-set do Prisma: a gravação só
 * acontece se o status e o `updatedAt` ainda forem os esperados.
 */
class InMemoryBudgets implements BudgetRepositoryPort {
  budgets = new Map<string, Budget>();
  /** O que o "banco" tem gravado; a entidade em memória é mutada antes de gravar. */
  private readonly rows = new Map<
    string,
    { status: BudgetStatus; updatedAt: number }
  >();
  createFailures: BudgetApplicationError[] = [];
  createCalls = 0;

  create(budget: Budget): Promise<Budget> {
    this.createCalls += 1;
    const failure = this.createFailures.shift();
    if (failure) return Promise.reject(failure);
    this.save(budget);
    return Promise.resolve(budget);
  }

  updateGenerated(budget: Budget, expectedUpdatedAt: Date) {
    return this.compareAndSet(
      budget,
      expectedUpdatedAt,
      BudgetStatus.GENERATED,
    );
  }

  updateWaitingApproval(budget: Budget, expectedUpdatedAt: Date) {
    return this.compareAndSet(
      budget,
      expectedUpdatedAt,
      BudgetStatus.WAITING_APPROVAL,
    );
  }

  findById(id: string): Promise<Budget | null> {
    return Promise.resolve(this.budgets.get(id) ?? null);
  }

  findByApprovalTokenHash(hash: string): Promise<Budget | null> {
    return Promise.resolve(
      [...this.budgets.values()].find(
        (budget) => budget.getApprovalTokenHash() === hash,
      ) ?? null,
    );
  }

  findAll(): Promise<Budget[]> {
    return Promise.resolve([...this.budgets.values()]);
  }

  findByServiceOrderId(serviceOrderId: string): Promise<Budget[]> {
    return Promise.resolve(
      [...this.budgets.values()]
        .filter((budget) => budget.getServiceOrderId() === serviceOrderId)
        .sort((a, b) => b.getVersion() - a.getVersion()),
    );
  }

  async findWaitingApprovalByServiceOrderId(serviceOrderId: string) {
    const budgets = await this.findByServiceOrderId(serviceOrderId);
    return (
      budgets.find((b) => b.getStatus() === BudgetStatus.WAITING_APPROVAL) ??
      null
    );
  }

  async findLastVersionByServiceOrderId(serviceOrderId: string) {
    const [latest] = await this.findByServiceOrderId(serviceOrderId);
    return latest?.getVersion() ?? 0;
  }

  /** Simula outra requisição ter gravado antes: o `updatedAt` deixa de bater. */
  touch(id: string): void {
    const row = this.rows.get(id)!;
    this.rows.set(id, { ...row, updatedAt: row.updatedAt + 1000 });
  }

  private compareAndSet(
    budget: Budget,
    expectedUpdatedAt: Date,
    expectedStatus: BudgetStatus,
  ): Promise<Budget | null> {
    const row = this.rows.get(budget.getId());
    const stale =
      !row ||
      row.status !== expectedStatus ||
      row.updatedAt !== expectedUpdatedAt.getTime();
    if (stale) return Promise.resolve(null);
    this.save(budget);
    return Promise.resolve(budget);
  }

  private save(budget: Budget): void {
    this.budgets.set(budget.getId(), budget);
    this.rows.set(budget.getId(), {
      status: budget.getStatus(),
      updatedAt: budget.getUpdatedAt().getTime(),
    });
  }
}

class FakeServiceOrders implements ServiceOrderPort {
  orders = new Map<string, ServiceOrderSummary>();
  awaitApproval = jest.fn().mockResolvedValue(undefined);
  awaitParts = jest.fn().mockResolvedValue(undefined);

  findById(id: string): Promise<ServiceOrderSummary | null> {
    return Promise.resolve(this.orders.get(id) ?? null);
  }
}

class FakeNotifier implements BudgetNotifierPort {
  budgetReady = jest.fn<Promise<void>, [BudgetReadyNotice]>(() =>
    Promise.resolve(),
  );
  stockPartsRequested = jest.fn<Promise<void>, [StockPartsRequestedNotice]>(
    () => Promise.resolve(),
  );
}

const partItem = {
  partId: 'part-1',
  description: 'Brake pad',
  type: BudgetItemType.PART,
  quantity: 2,
  unitPrice: 50,
};
const serviceItem = {
  serviceId: 'service-1',
  description: 'Oil change',
  type: BudgetItemType.SERVICE,
  quantity: 1,
  unitPrice: 149.9,
};

describe('budget use cases', () => {
  let budgets: InMemoryBudgets;
  let serviceOrders: FakeServiceOrders;
  let notifier: FakeNotifier;
  let services: { exists: jest.Mock };
  let parts: { exists: jest.Mock };
  let create: CreateBudgetUseCase;
  let addItem: AddBudgetItemUseCase;
  let removeItem: RemoveBudgetItemUseCase;
  let calculateTotal: CalculateBudgetTotalUseCase;
  let send: SendBudgetUseCase;
  let accept: AcceptBudgetUseCase;
  let refuse: RefuseBudgetUseCase;
  let find: FindBudgetUseCase;
  let list: ListBudgetsUseCase;
  let listByServiceOrder: ListBudgetsByServiceOrderUseCase;
  let findAccepted: FindAcceptedBudgetUseCase;
  let findByToken: FindBudgetByApprovalTokenUseCase;
  let applyExternalDecision: ApplyExternalDecisionUseCase;

  beforeEach(() => {
    budgets = new InMemoryBudgets();
    serviceOrders = new FakeServiceOrders();
    serviceOrders.orders.set(SERVICE_ORDER_ID, {
      id: SERVICE_ORDER_ID,
      clientId: 'client-1',
      status: 'IN_DIAGNOSIS',
    });
    notifier = new FakeNotifier();
    services = { exists: jest.fn().mockResolvedValue(true) };
    parts = { exists: jest.fn().mockResolvedValue(true) };

    const store = new BudgetStore(budgets, serviceOrders);
    const references = new BudgetItemReferences(services, parts);
    create = new CreateBudgetUseCase(budgets, serviceOrders, references);
    addItem = new AddBudgetItemUseCase(store, references);
    removeItem = new RemoveBudgetItemUseCase(store);
    calculateTotal = new CalculateBudgetTotalUseCase(store);
    send = new SendBudgetUseCase(store, notifier);
    accept = new AcceptBudgetUseCase(store, serviceOrders, notifier);
    refuse = new RefuseBudgetUseCase(store);
    find = new FindBudgetUseCase(store);
    list = new ListBudgetsUseCase(budgets);
    listByServiceOrder = new ListBudgetsByServiceOrderUseCase(budgets, store);
    findAccepted = new FindAcceptedBudgetUseCase(budgets);
    findByToken = new FindBudgetByApprovalTokenUseCase(budgets);
    applyExternalDecision = new ApplyExternalDecisionUseCase(
      findByToken,
      accept,
      refuse,
    );
  });

  const createBudget = (
    items: CreateBudgetItemInput[] = [partItem, serviceItem],
  ) => create.execute({ serviceOrderId: SERVICE_ORDER_ID, items });

  const sentBudget = async (
    items: CreateBudgetItemInput[] = [partItem, serviceItem],
  ) => {
    const budget = await createBudget(items);
    const sent = await send.execute(budget.getId());
    return { sent, token: notifier.budgetReady.mock.calls[0][0].approvalToken };
  };

  describe('criação e versões', () => {
    it('creates the first budget with version 1 and moves the service order to awaiting approval', async () => {
      const budget = await createBudget();

      expect(budget.getVersion()).toBe(1);
      expect(budget.getStatus()).toBe(BudgetStatus.GENERATED);
      expect(budget.getTotal().value).toBe(249.9);
      expect(serviceOrders.awaitApproval).toHaveBeenCalledWith(
        SERVICE_ORDER_ID,
      );
      expect(notifier.budgetReady).not.toHaveBeenCalled();
    });

    it('normalizes the service order id before allocating the version', async () => {
      const budget = await create.execute({
        serviceOrderId: `  ${SERVICE_ORDER_ID}  `,
        items: [partItem],
      });

      expect(budget.getServiceOrderId()).toBe(SERVICE_ORDER_ID);
    });

    it('an additional repair gets the next version and leaves the service order alone', async () => {
      const first = await createBudget();
      await send.execute(first.getId());
      await refuse.execute(first.getId(), { reason: 'Caro' });
      serviceOrders.awaitApproval.mockClear();

      const second = await createBudget();

      expect(second.getVersion()).toBe(2);
      expect(serviceOrders.awaitApproval).not.toHaveBeenCalled();
    });

    it('retries with the next version when the repository reports the version as taken', async () => {
      budgets.createFailures = [
        new BudgetApplicationError('BUDGET_VERSION_TAKEN'),
      ];

      const budget = await createBudget();

      expect(budgets.createCalls).toBe(2);
      expect(budget.getVersion()).toBe(1);
    });

    it('gives up after three version races', async () => {
      budgets.createFailures = Array.from(
        { length: 3 },
        () => new BudgetApplicationError('BUDGET_VERSION_TAKEN'),
      );

      await expect(createBudget()).rejects.toMatchObject({
        code: 'BUDGET_VERSION_TAKEN',
        message: 'Não foi possível alocar a versão do orçamento',
      });
      expect(budgets.createCalls).toBe(3);
    });

    it('does not retry a non-version uniqueness failure', async () => {
      budgets.createFailures = [
        new BudgetApplicationError('BUDGET_VERSION_ALLOCATION'),
      ];

      await expect(createBudget()).rejects.toMatchObject({
        code: 'BUDGET_VERSION_ALLOCATION',
      });
      expect(budgets.createCalls).toBe(1);
    });

    it('rejects a budget for an unknown service order', async () => {
      await expect(
        create.execute({ serviceOrderId: 'missing', items: [partItem] }),
      ).rejects.toMatchObject({
        code: 'SERVICE_ORDER_NOT_FOUND',
        message: 'Ordem de serviço não encontrada',
      });
    });

    it.each(['CANCELLED', 'COMPLETED', 'DELIVERED'])(
      'rejects a new budget when the service order is %s',
      async (status) => {
        serviceOrders.orders.set(SERVICE_ORDER_ID, {
          id: SERVICE_ORDER_ID,
          clientId: 'client-1',
          status,
        });

        await expect(createBudget()).rejects.toMatchObject({
          code: 'SERVICE_ORDER_CLOSED',
          kind: 'CONFLICT',
          message: `Ordem de serviço ${status} não aceita novo orçamento`,
        });
      },
    );

    it('refuses a new version while one still waits for the customer', async () => {
      await sentBudget();

      await expect(createBudget()).rejects.toMatchObject({
        code: 'BUDGET_WAITING_APPROVAL',
        message:
          'A versão 1 do orçamento aguarda aprovação do cliente; aceite ou recuse antes de gerar outra',
      });
    });

    it('allows a new version once the previous one was answered', async () => {
      const { sent } = await sentBudget();
      await accept.execute(sent.getId());

      await expect(createBudget()).resolves.toMatchObject({});
      expect(
        await budgets.findLastVersionByServiceOrderId(SERVICE_ORDER_ID),
      ).toBe(2);
    });
  });

  describe('referências ao catálogo', () => {
    it('checks each distinct service and part once before creating', async () => {
      await createBudget([serviceItem, serviceItem, partItem, { ...partItem }]);

      expect(services.exists).toHaveBeenCalledTimes(1);
      expect(services.exists).toHaveBeenCalledWith('service-1');
      expect(parts.exists).toHaveBeenCalledTimes(1);
      expect(parts.exists).toHaveBeenCalledWith('part-1');
    });

    it('skips the catalogs when no item references them', async () => {
      await createBudget([
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 149.9,
        },
      ]);

      expect(services.exists).not.toHaveBeenCalled();
      expect(parts.exists).not.toHaveBeenCalled();
    });

    it('rejects an unknown service or part with the same 404 as the catalogs', async () => {
      services.exists.mockResolvedValue(false);
      await expect(createBudget([serviceItem])).rejects.toMatchObject({
        code: 'SERVICE_NOT_FOUND',
        message: 'Serviço não encontrado',
      });

      parts.exists.mockResolvedValue(false);
      await expect(createBudget([partItem])).rejects.toMatchObject({
        code: 'PART_NOT_FOUND',
        message: 'Peça não encontrada',
      });
      expect(budgets.createCalls).toBe(0);
    });

    it('validates references when adding an item to an existing budget', async () => {
      const budget = await createBudget([partItem]);
      services.exists.mockResolvedValue(false);

      await expect(
        addItem.execute(budget.getId(), serviceItem),
      ).rejects.toMatchObject({ code: 'SERVICE_NOT_FOUND' });
    });
  });

  describe('itens e total', () => {
    it('adds and removes items on a generated budget, persisting the new total', async () => {
      const budget = await createBudget([partItem]);

      const withService = await addItem.execute(budget.getId(), serviceItem);
      expect(withService.getItems()).toHaveLength(2);
      await expect(calculateTotal.execute(budget.getId())).resolves.toBe(249.9);

      const itemId = withService.getItems()[1].getId();
      const trimmed = await removeItem.execute(budget.getId(), itemId);
      expect(trimmed.getItems()).toHaveLength(1);
      await expect(calculateTotal.execute(budget.getId())).resolves.toBe(100);
    });

    it('converts the decimal price to money at the boundary', () => {
      expect(BudgetItemReferences.toProps(serviceItem).unitPrice).toEqual(
        Money.fromDecimal(149.9),
      );
    });

    it('rejects a generated-state change when another request got there first', async () => {
      const budget = await createBudget([partItem]);
      budgets.touch(budget.getId());

      await expect(
        addItem.execute(budget.getId(), serviceItem),
      ).rejects.toMatchObject({
        code: 'BUDGET_CONCURRENT_UPDATE',
        message: 'O status do orçamento foi alterado por outra requisição',
      });
    });
  });

  describe('envio, aceite e recusa', () => {
    it('sends the budget and emails the personal approval link', async () => {
      const { sent, token } = await sentBudget();

      expect(sent.getStatus()).toBe(BudgetStatus.WAITING_APPROVAL);
      expect(ApprovalToken.parse(token)?.digest()).toBe(
        sent.getApprovalTokenHash(),
      );
      expect(notifier.budgetReady).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceOrderId: SERVICE_ORDER_ID,
          total: 249.9,
          approvalExpiresAt: sent.getApprovalTokenExpiresAt(),
          items: [
            expect.objectContaining({
              description: 'Brake pad',
              subtotal: 100,
            }),
            expect.objectContaining({
              description: 'Oil change',
              subtotal: 149.9,
            }),
          ],
        }),
      );
    });

    it('accepting moves the service order to awaiting parts and asks stock for the parts', async () => {
      const { sent } = await sentBudget();

      const accepted = await accept.execute(sent.getId());

      expect(accepted.getStatus()).toBe(BudgetStatus.ACCEPTED);
      expect(serviceOrders.awaitParts).toHaveBeenCalledWith(SERVICE_ORDER_ID);
      expect(notifier.stockPartsRequested).toHaveBeenCalledWith({
        serviceOrderId: SERVICE_ORDER_ID,
        parts: [{ description: 'Brake pad', quantity: 2 }],
      });
    });

    it('a services-only budget still goes through the parts request', async () => {
      const { sent } = await sentBudget([serviceItem]);

      await accept.execute(sent.getId());

      expect(serviceOrders.awaitParts).toHaveBeenCalledWith(SERVICE_ORDER_ID);
      expect(notifier.stockPartsRequested).toHaveBeenCalledWith({
        serviceOrderId: SERVICE_ORDER_ID,
        parts: [],
      });
    });

    it('refusing records the reason and does not touch the service order', async () => {
      const { sent } = await sentBudget();

      const refused = await refuse.execute(sent.getId(), { reason: 'Caro' });

      expect(refused.getStatus()).toBe(BudgetStatus.REFUSED);
      expect(refused.getRefusalReason()).toBe('Caro');
      expect(serviceOrders.awaitParts).not.toHaveBeenCalled();
    });

    it('rejects a decision when the budget was already answered elsewhere', async () => {
      const { sent } = await sentBudget();
      budgets.touch(sent.getId());

      await expect(accept.execute(sent.getId())).rejects.toMatchObject({
        code: 'BUDGET_CONCURRENT_UPDATE',
      });
    });
  });

  describe('decisão pelo link do email (webhook)', () => {
    it('approval with the email token accepts the budget', async () => {
      const { sent, token } = await sentBudget();

      const budget = await applyExternalDecision.execute({
        token,
        decision: BudgetDecision.APPROVED,
      });

      expect(budget.getId()).toBe(sent.getId());
      expect(budget.getStatus()).toBe(BudgetStatus.ACCEPTED);
      expect(serviceOrders.awaitParts).toHaveBeenCalledWith(SERVICE_ORDER_ID);
    });

    it('refusal records the reason, defaulting to empty', async () => {
      const { token } = await sentBudget();

      const budget = await applyExternalDecision.execute({
        token,
        decision: BudgetDecision.REFUSED,
        reason: 'Vou pesquisar',
      });

      expect(budget.getStatus()).toBe(BudgetStatus.REFUSED);
      expect(budget.getRefusalReason()).toBe('Vou pesquisar');

      const { token: other } = await (async () => {
        serviceOrders.awaitApproval.mockClear();
        notifier.budgetReady.mockClear();
        return sentBudget();
      })();
      await expect(
        applyExternalDecision.execute({
          token: other,
          decision: BudgetDecision.REFUSED,
        }),
      ).rejects.toThrow('Motivo da recusa é obrigatório');
    });

    it('unknown token is 404, and the budget id does not work as a token', async () => {
      const { sent } = await sentBudget();

      await expect(findByToken.execute(sent.getId())).rejects.toMatchObject({
        code: 'APPROVAL_LINK_INVALID',
        kind: 'NOT_FOUND',
        message: 'Link de aprovação inválido',
      });
      await expect(
        findByToken.execute(ApprovalToken.issue().value),
      ).rejects.toMatchObject({ code: 'APPROVAL_LINK_INVALID' });
    });

    it('expired link is 410 and changes nothing', async () => {
      const { sent, token } = await sentBudget();
      jest
        .useFakeTimers()
        .setSystemTime(
          new Date(sent.getApprovalTokenExpiresAt()!.getTime() + 1),
        );

      try {
        await expect(
          applyExternalDecision.execute({
            token,
            decision: BudgetDecision.APPROVED,
          }),
        ).rejects.toMatchObject({
          code: 'APPROVAL_LINK_EXPIRED',
          kind: 'GONE',
          message:
            'Link de aprovação vencido; peça à oficina um novo orçamento',
        });
      } finally {
        jest.useRealTimers();
      }
      expect((await budgets.findById(sent.getId()))?.getStatus()).toBe(
        BudgetStatus.WAITING_APPROVAL,
      );
    });

    it('redelivering the same decision does not repeat the effects', async () => {
      const { token } = await sentBudget();
      const input = { token, decision: BudgetDecision.APPROVED };

      await applyExternalDecision.execute(input);
      const again = await applyExternalDecision.execute(input);

      expect(again.getStatus()).toBe(BudgetStatus.ACCEPTED);
      expect(serviceOrders.awaitParts).toHaveBeenCalledTimes(1);
      expect(notifier.stockPartsRequested).toHaveBeenCalledTimes(1);
    });

    it('the opposite decision is a conflict', async () => {
      const { token } = await sentBudget();
      await applyExternalDecision.execute({
        token,
        decision: BudgetDecision.APPROVED,
      });

      await expect(
        applyExternalDecision.execute({
          token,
          decision: BudgetDecision.REFUSED,
          reason: 'x',
        }),
      ).rejects.toMatchObject({
        code: 'BUDGET_ALREADY_ANSWERED',
        message: 'O orçamento já foi aceito',
      });

      const { token: second } = await (async () => {
        notifier.budgetReady.mockClear();
        return sentBudget();
      })();
      await applyExternalDecision.execute({
        token: second,
        decision: BudgetDecision.REFUSED,
        reason: 'Caro',
      });
      await expect(
        applyExternalDecision.execute({
          token: second,
          decision: BudgetDecision.APPROVED,
        }),
      ).rejects.toMatchObject({ message: 'O orçamento já foi recusado' });
    });
  });

  describe('consultas e recorte do CUSTOMER', () => {
    it('lists all budgets and the budgets of a service order, latest version first', async () => {
      const first = await createBudget();
      await send.execute(first.getId());
      await refuse.execute(first.getId(), { reason: 'Caro' });
      await createBudget();

      await expect(list.execute()).resolves.toHaveLength(2);
      const byOrder = await listByServiceOrder.execute(` ${SERVICE_ORDER_ID} `);
      expect(byOrder.map((b) => b.getVersion())).toEqual([2, 1]);
    });

    it('finds the accepted budget with the highest version, or null', async () => {
      await expect(findAccepted.execute(SERVICE_ORDER_ID)).resolves.toBeNull();

      const { sent } = await sentBudget();
      await accept.execute(sent.getId());
      const second = await createBudget();
      await send.execute(second.getId());
      await accept.execute(second.getId());

      const accepted = await findAccepted.execute(SERVICE_ORDER_ID);
      expect(accepted?.getVersion()).toBe(2);
    });

    it('throws BUDGET_NOT_FOUND for an unknown budget', async () => {
      await expect(find.execute('missing')).rejects.toMatchObject({
        code: 'BUDGET_NOT_FOUND',
        message: 'Orçamento não encontrado',
      });
    });

    it('delivers the budget of the customer own service order', async () => {
      const budget = await createBudget();

      await expect(find.execute(budget.getId(), 'client-1')).resolves.toBe(
        budget,
      );
    });

    it('hides the budget of another customer service order, as if it did not exist', async () => {
      const { sent } = await sentBudget();

      await expect(
        find.execute(sent.getId(), 'client-2'),
      ).rejects.toMatchObject({ code: 'BUDGET_NOT_FOUND' });
      await expect(
        accept.execute(sent.getId(), 'client-2'),
      ).rejects.toMatchObject({ code: 'BUDGET_NOT_FOUND' });
      await expect(
        refuse.execute(sent.getId(), { reason: 'x' }, 'client-2'),
      ).rejects.toMatchObject({ code: 'BUDGET_NOT_FOUND' });
      expect(serviceOrders.awaitParts).not.toHaveBeenCalled();
    });

    it('does not list the budgets of another customer service order', async () => {
      await createBudget();

      await expect(
        listByServiceOrder.execute(SERVICE_ORDER_ID, 'client-2'),
      ).rejects.toMatchObject({
        code: 'SERVICE_ORDER_NOT_FOUND',
        message: 'Ordem de serviço não encontrada',
      });
      await expect(
        listByServiceOrder.execute(SERVICE_ORDER_ID, 'client-1'),
      ).resolves.toHaveLength(1);
    });

    it('treats a missing service order as outside the scope', async () => {
      const budget = await createBudget();
      serviceOrders.orders.clear();

      await expect(
        find.execute(budget.getId(), 'client-1'),
      ).rejects.toMatchObject({ code: 'BUDGET_NOT_FOUND' });
    });

    it('without a scope the workshop does not consult the service order', async () => {
      const budget = await createBudget();
      const spy = jest.spyOn(serviceOrders, 'findById');

      await find.execute(budget.getId());

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
