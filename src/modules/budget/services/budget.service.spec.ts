import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../entities/budget.entity';
import { ServiceOrderController } from '../../service-order/controllers/service-order.controller';
import { ServiceController } from '../../service-catalog/controllers/service.controller';
import { Client } from '../../client/entities/client.entity';
import { ClientRepository } from '../../client/repositories/client.repository';
import { NotificationType } from '../../notification/enums/notification-type.enum';
import { NotificationService } from '../../notification/services/notification.service';
import { BudgetRepository } from '../repositories/budget.repository';
import { BudgetService } from './budget.service';
import { Money } from '../../../shared/domain/value-objects/money.vo';

type MockedRepository = {
  [K in keyof BudgetRepository]: jest.Mock;
};

const makeBudget = () =>
  Budget.create({
    serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    version: 1,
    items: [
      {
        description: 'Oil change',
        type: BudgetItemType.SERVICE,
        quantity: 1,
        unitPrice: Money.fromDecimal(120),
      },
    ],
  });

describe('BudgetService', () => {
  let service: BudgetService;
  let repository: MockedRepository;
  let serviceOrderController: {
    awaitApproval: jest.Mock;
    awaitParts: jest.Mock;
    cancel: jest.Mock;
  };
  let serviceCatalogController: { findById: jest.Mock };
  let clientRepository: { findById: jest.Mock };
  let notifications: { enqueue: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    repository = {
      create: jest.fn((budget: Budget) => budget),
      updateGenerated: jest.fn((budget: Budget) => budget),
      updateWaitingApproval: jest.fn((budget: Budget) => budget),
      findById: jest.fn(),
      findAll: jest.fn(),
      findByServiceOrderId: jest.fn(),
      findLastVersionByServiceOrderId: jest.fn(),
    };

    serviceOrderController = {
      awaitApproval: jest.fn().mockResolvedValue({ clientId: 'client-1' }),
      awaitParts: jest.fn(),
      cancel: jest.fn(),
    };
    serviceCatalogController = { findById: jest.fn() };
    clientRepository = { findById: jest.fn() };
    notifications = { enqueue: jest.fn() };
    config = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: BudgetRepository, useValue: repository },
        {
          provide: ServiceOrderController,
          useValue: serviceOrderController,
        },
        {
          provide: ServiceController,
          useValue: serviceCatalogController,
        },
        { provide: ClientRepository, useValue: clientRepository },
        { provide: NotificationService, useValue: notifications },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<BudgetService>(BudgetService);
  });

  it('lists all budgets', async () => {
    const budgets = [makeBudget()];
    repository.findAll.mockResolvedValue(budgets);

    await expect(service.findAll()).resolves.toEqual(budgets);
    expect(repository.findAll).toHaveBeenCalledWith();
  });

  it('creates first budget with version 1', async () => {
    repository.findLastVersionByServiceOrderId.mockResolvedValue(0);

    const result = await service.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    });

    expect(result.getVersion()).toBe(1);
    expect(repository.create).toHaveBeenCalled();
  });

  it('queues the first budget after awaiting approval', async () => {
    const client = Client.create({
      name: 'Maria Silva',
      document: '529.982.247-25',
      email: 'maria@example.com',
      phone: '(11) 99999-8888',
    });
    repository.findLastVersionByServiceOrderId.mockResolvedValue(0);
    serviceOrderController.awaitApproval.mockResolvedValue({
      clientId: client.getId(),
    });
    clientRepository.findById.mockResolvedValue(client);

    await service.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    });

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.BUDGET_READY,
        to: client.getEmail().getValue(),
        text: expect.stringContaining('Oil change'),
        html: expect.stringContaining('R$'),
      }),
    );
  });

  it('normalizes service order id before allocating the next version', async () => {
    repository.findLastVersionByServiceOrderId.mockResolvedValue(1);

    const result = await service.create({
      serviceOrderId: ' 4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b ',
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    });

    expect(repository.findLastVersionByServiceOrderId).toHaveBeenCalledWith(
      '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    );
    expect(result.getServiceOrderId()).toBe(
      '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    );
    expect(result.getVersion()).toBe(2);
  });

  it('creates next budget with incremented version for same serviceOrderId', async () => {
    repository.findLastVersionByServiceOrderId.mockResolvedValue(2);

    const result = await service.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      items: [
        {
          description: 'Brake pad',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 80,
        },
      ],
    });

    expect(result.getVersion()).toBe(3);
  });

  it('retries allocation with the next version after a duplicate version conflict', async () => {
    repository.findLastVersionByServiceOrderId
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    repository.create
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: ['serviceOrderId', 'version'] },
      })
      .mockImplementation((budget: Budget) => budget);

    const result = await service.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      items: [
        {
          description: 'Brake pad',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 80,
        },
      ],
    });

    expect(result.getVersion()).toBe(3);
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('translates a non-version unique conflict to a controlled error', async () => {
    repository.findLastVersionByServiceOrderId.mockResolvedValue(0);
    repository.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['id'] },
    });

    await expect(
      service.create({
        serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
        items: [
          {
            description: 'Brake pad',
            type: BudgetItemType.PART,
            quantity: 1,
            unitPrice: 80,
          },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('retries allocation after an adapter-reported version unique conflict', async () => {
    repository.findLastVersionByServiceOrderId
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    repository.create
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: { constraint: { fields: ['serviceOrderId', 'version'] } },
          },
        },
      })
      .mockImplementation((budget: Budget) => budget);

    const result = await service.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      items: [
        {
          description: 'Brake pad',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 80,
        },
      ],
    });

    expect(result.getVersion()).toBe(3);
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('retries allocation when Prisma reports the version constraint as a string', async () => {
    repository.findLastVersionByServiceOrderId
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    repository.create
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: 'budget_serviceOrderId_version_key' },
      })
      .mockImplementation((budget: Budget) => budget);

    const result = await service.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      items: [
        {
          description: 'Brake pad',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 80,
        },
      ],
    });

    expect(result.getVersion()).toBe(3);
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('does not retry an adapter-reported non-version unique conflict', async () => {
    repository.findLastVersionByServiceOrderId.mockResolvedValue(0);
    repository.create.mockRejectedValue({
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { fields: ['id'] } },
        },
      },
    });

    await expect(
      service.create({
        serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
        items: [
          {
            description: 'Brake pad',
            type: BudgetItemType.PART,
            quantity: 1,
            unitPrice: 80,
          },
        ],
      }),
    ).rejects.toThrow(ConflictException);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('adds an item to a generated budget and persists the new total', async () => {
    const budget = makeBudget();
    const expectedUpdatedAt = budget.getUpdatedAt();
    repository.findById.mockResolvedValue(budget);

    const result = await service.addItem(budget.getId(), {
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: 40,
    });

    expect(result.getItems()).toHaveLength(2);
    expect(result.getTotal().value).toBe(160);
    expect(repository.updateGenerated).toHaveBeenCalledWith(
      result,
      expectedUpdatedAt,
    );
  });

  it('removes an item from a generated budget and persists the new total', async () => {
    const budget = makeBudget();
    budget.addItem({
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: Money.fromDecimal(40),
    });
    repository.findById.mockResolvedValue(budget);

    const itemId = budget.getItems()[1].getId();
    const result = await service.removeItem(budget.getId(), itemId);

    expect(result.getItems()).toHaveLength(1);
    expect(result.getTotal().value).toBe(120);
    expect(repository.updateGenerated).toHaveBeenCalledWith(
      result,
      expect.any(Date),
    );
  });

  it('calculates total from persisted budget items', async () => {
    const budget = makeBudget();
    budget.addItem({
      description: 'Oil change',
      type: BudgetItemType.SERVICE,
      quantity: 1,
      unitPrice: Money.fromDecimal(120),
    });
    repository.findById.mockResolvedValue(budget);

    await expect(service.calculateTotal(budget.getId())).resolves.toBe(240);
  });

  it('sends a generated budget to the customer', async () => {
    const budget = makeBudget();
    repository.findById.mockResolvedValue(budget);

    const result = await service.send(budget.getId());

    expect(result.getStatus()).toBe(BudgetStatus.WAITING_APPROVAL);
    expect(result.getSentAt()).toBeInstanceOf(Date);
    expect(repository.updateGenerated).toHaveBeenCalledWith(
      result,
      expect.any(Date),
    );
  });

  it('accepts a budget waiting for approval and persists terminal status', async () => {
    const budget = makeBudget();
    budget.sendToClient();
    const expectedUpdatedAt = budget.getUpdatedAt();
    repository.findById.mockResolvedValue(budget);

    const result = await service.accept(budget.getId());

    expect(result.getStatus()).toBe(BudgetStatus.ACCEPTED);
    expect(result.getAnsweredAt()).toBeInstanceOf(Date);
    expect(result.getRefusalReason()).toBeNull();
    expect(repository.updateWaitingApproval).toHaveBeenCalledWith(
      result,
      expectedUpdatedAt,
    );
  });

  it('queues accepted parts to the stock mailbox after the service order awaits parts', async () => {
    const budget = Budget.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      version: 1,
      items: [
        {
          description: 'Brake pad',
          type: BudgetItemType.PART,
          quantity: 2,
          unitPrice: Money.fromDecimal(80),
        },
        {
          description: 'Brake replacement',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: Money.fromDecimal(120),
        },
      ],
    });
    budget.sendToClient();
    repository.findById.mockResolvedValue(budget);
    serviceOrderController.awaitParts.mockResolvedValue(undefined);
    config.get.mockReturnValue('estoque@example.com');

    await service.accept(budget.getId());

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.STOCK_PARTS_REQUESTED,
        to: 'estoque@example.com',
        subject: expect.stringContaining(
          '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
        ),
        text: expect.stringContaining('Brake pad'),
        html: expect.stringContaining('Brake pad'),
      }),
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining('Brake replacement'),
        html: expect.not.stringContaining('Brake replacement'),
      }),
    );
  });

  it('does not block an accepted budget when the stock mailbox is not a valid email', async () => {
    const budget = makeBudget();
    budget.sendToClient();
    repository.findById.mockResolvedValue(budget);
    config.get.mockReturnValue('not-an-email');

    await expect(service.accept(budget.getId())).resolves.toBe(budget);
    expect(serviceOrderController.awaitParts).toHaveBeenCalledWith(
      '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    );
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('queues a stock request with no items when an accepted budget has no parts', async () => {
    const budget = makeBudget();
    budget.sendToClient();
    repository.findById.mockResolvedValue(budget);
    config.get.mockReturnValue('estoque@example.com');

    await service.accept(budget.getId());

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.STOCK_PARTS_REQUESTED,
        text: expect.stringContaining('Peças:'),
      }),
    );
  });

  it('does not block an accepted budget when queueing the stock request fails', async () => {
    const budget = makeBudget();
    budget.sendToClient();
    repository.findById.mockResolvedValue(budget);
    config.get.mockReturnValue('estoque@example.com');
    notifications.enqueue.mockRejectedValue(new Error('queue unavailable'));

    await expect(service.accept(budget.getId())).resolves.toBe(budget);
    expect(serviceOrderController.awaitParts).toHaveBeenCalledWith(
      '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    );
  });

  it('refuses a budget waiting for approval with a required reason', async () => {
    const budget = makeBudget();
    budget.sendToClient();
    repository.findById.mockResolvedValue(budget);

    const result = await service.refuse(budget.getId(), {
      reason: 'Customer found it expensive',
    });

    expect(result.getStatus()).toBe(BudgetStatus.REFUSED);
    expect(result.getRefusalReason()).toBe('Customer found it expensive');
    expect(result.getAnsweredAt()).toBeInstanceOf(Date);
    expect(repository.updateWaitingApproval).toHaveBeenCalledWith(
      result,
      expect.any(Date),
    );
  });

  it('rejects a generated-state change when its conditional persistence is stale', async () => {
    const budget = makeBudget();
    repository.findById.mockResolvedValue(budget);
    repository.updateGenerated.mockResolvedValue(null);

    await expect(
      service.addItem(budget.getId(), {
        description: 'Oil filter',
        type: BudgetItemType.PART,
        quantity: 1,
        unitPrice: 40,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a waiting-approval decision when its conditional persistence is stale', async () => {
    const budget = makeBudget();
    budget.sendToClient();
    repository.findById.mockResolvedValue(budget);
    repository.updateWaitingApproval.mockResolvedValue(null);

    await expect(service.accept(budget.getId())).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws NotFoundException when budget does not exist', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(
      new NotFoundException('Orçamento não encontrado'),
    );
  });

  it('finds budgets by service order id', async () => {
    const budgets = [makeBudget()];
    repository.findByServiceOrderId.mockResolvedValue(budgets);

    await expect(
      service.findByServiceOrderId(' 4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b '),
    ).resolves.toBe(budgets);
    expect(repository.findByServiceOrderId).toHaveBeenCalledWith(
      '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    );
  });
  describe('políticas do Event Storming', () => {
    const makeBudgetWithPart = () =>
      Budget.create({
        serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
        version: 1,
        items: [
          {
            partId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
            description: 'Oil filter',
            type: BudgetItemType.PART,
            quantity: 1,
            unitPrice: Money.fromDecimal(40),
          },
        ],
      });

    it('gerar o primeiro orçamento coloca a OS aguardando aprovação', async () => {
      repository.findLastVersionByServiceOrderId.mockResolvedValue(0);

      await service.create({
        serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
        items: [
          {
            description: 'Oil change',
            type: BudgetItemType.SERVICE,
            quantity: 1,
            unitPrice: 120,
          },
        ],
      });

      expect(serviceOrderController.awaitApproval).toHaveBeenCalledWith(
        '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      );
    });

    it('orçamento de reparo adicional não mexe no status da OS', async () => {
      // A OS já saiu do diagnóstico; a versão 2 nasce durante a execução.
      repository.findLastVersionByServiceOrderId.mockResolvedValue(1);

      await service.create({
        serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
        items: [
          {
            description: 'Reparo extra',
            type: BudgetItemType.SERVICE,
            quantity: 1,
            unitPrice: 90,
          },
        ],
      });

      expect(serviceOrderController.awaitApproval).not.toHaveBeenCalled();
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('orçamento aceito com peças coloca a OS aguardando peças', async () => {
      const budget = makeBudgetWithPart();
      budget.sendToClient();
      repository.findById.mockResolvedValue(budget);

      await service.accept(budget.getId());

      expect(serviceOrderController.awaitParts).toHaveBeenCalledWith(
        '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      );
    });

    it('orçamento só de serviços também passa pela solicitação de peças', async () => {
      const budget = makeBudget();
      budget.sendToClient();
      repository.findById.mockResolvedValue(budget);

      await service.accept(budget.getId());

      // O board não bifurca no aceite: quem libera a OS é o despacho.
      expect(serviceOrderController.awaitParts).toHaveBeenCalledWith(
        '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      );
    });

    it('orçamento recusado NÃO encerra a ordem de serviço', async () => {
      const budget = makeBudget();
      budget.sendToClient();
      repository.findById.mockResolvedValue(budget);

      const refused = await service.refuse(budget.getId(), {
        reason: 'Achou caro',
      });

      // A OS fica em Aguardando aprovação para o mecânico refazer a proposta.
      // Cancelar é decisão manual de quem atende, via
      // PATCH /service-orders/:id/cancel.
      expect(serviceOrderController.cancel).not.toHaveBeenCalled();
      expect(refused.getStatus()).toBe(BudgetStatus.REFUSED);
      expect(refused.getRefusalReason()).toBe('Achou caro');
    });

    it('permite gerar uma nova versão depois da recusa, sem tocar na OS', async () => {
      const refusedBudget = makeBudget();
      refusedBudget.sendToClient();
      repository.findById.mockResolvedValue(refusedBudget);
      await service.refuse(refusedBudget.getId(), { reason: 'Achou caro' });

      // Já existe a versão 1 recusada: a próxima proposta nasce como versão 2 e
      // a OS não recebe transição nenhuma, porque já está aguardando aprovação.
      repository.findLastVersionByServiceOrderId.mockResolvedValue(1);
      serviceOrderController.awaitApproval.mockClear();

      const nextBudget = await service.create({
        serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
        items: [
          {
            description: 'Proposta revisada',
            type: BudgetItemType.SERVICE,
            quantity: 1,
            unitPrice: 90,
          },
        ],
      });

      expect(nextBudget.getVersion()).toBe(2);
      expect(serviceOrderController.awaitApproval).not.toHaveBeenCalled();
      expect(serviceOrderController.cancel).not.toHaveBeenCalled();
    });
  });
});

describe('BudgetService — referência ao catálogo de serviços', () => {
  it('valida o serviço pelo controller do catálogo antes de criar', async () => {
    const { service, serviceCatalogController } = await makeSubject();

    await service.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      items: [
        {
          serviceId: 'catalog-1',
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    });

    expect(serviceCatalogController.findById).toHaveBeenCalledWith('catalog-1');
  });

  it('consulta cada serviço uma única vez, mesmo repetido', async () => {
    const { service, serviceCatalogController } = await makeSubject();

    await service.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      items: [
        {
          serviceId: 'catalog-1',
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
        {
          serviceId: 'catalog-1',
          description: 'Oil change (2)',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    });

    expect(serviceCatalogController.findById).toHaveBeenCalledTimes(1);
  });

  it('não consulta o catálogo quando nenhum item referencia serviço', async () => {
    const { service, serviceCatalogController } = await makeSubject();

    await service.create({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    });

    expect(serviceCatalogController.findById).not.toHaveBeenCalled();
  });

  it('propaga o 404 do catálogo quando o serviço não existe', async () => {
    const { service, serviceCatalogController, repository } =
      await makeSubject();
    serviceCatalogController.findById.mockRejectedValue(
      new NotFoundException('Service not found'),
    );

    await expect(
      service.create({
        serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
        items: [
          {
            serviceId: 'missing',
            description: 'Oil change',
            type: BudgetItemType.SERVICE,
            quantity: 1,
            unitPrice: 120,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('valida também ao adicionar item a um orçamento existente', async () => {
    const { service, serviceCatalogController, repository } =
      await makeSubject();
    const budget = makeBudget();
    repository.findById.mockResolvedValue(budget);
    repository.update.mockResolvedValue(budget);

    await service.addItem(budget.getId(), {
      serviceId: 'catalog-1',
      description: 'Wheel alignment',
      type: BudgetItemType.SERVICE,
      quantity: 1,
      unitPrice: 80,
    });

    expect(serviceCatalogController.findById).toHaveBeenCalledWith('catalog-1');
  });

  async function makeSubject() {
    const repository = {
      create: jest.fn((budget: Budget) => Promise.resolve(budget)),
      findById: jest.fn(),
      findByServiceOrderId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn(),
      update: jest.fn((budget: Budget) => Promise.resolve(budget)),
      updateGenerated: jest.fn((budget: Budget) => Promise.resolve(budget)),
      findLastVersionByServiceOrderId: jest.fn().mockResolvedValue(0),
    };
    const serviceCatalogController = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: BudgetRepository, useValue: repository },
        {
          provide: ServiceOrderController,
          useValue: {
            awaitApproval: jest.fn().mockResolvedValue({ clientId: 'c-1' }),
            awaitParts: jest.fn(),
            cancel: jest.fn(),
          },
        },
        { provide: ServiceController, useValue: serviceCatalogController },
        { provide: ClientRepository, useValue: { findById: jest.fn() } },
        { provide: NotificationService, useValue: { enqueue: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    return {
      service: module.get<BudgetService>(BudgetService),
      serviceCatalogController,
      repository,
    };
  }
});
