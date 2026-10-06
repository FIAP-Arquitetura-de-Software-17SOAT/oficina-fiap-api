import { DomainException } from '../../../../shared/domain/domain.exception';
import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { ServiceOrderStatus } from '../../domain/enums/service-order-status.enum';
import { ServiceOrderApplicationError } from '../errors/service-order-application.error';
import { ServiceOrderRepositoryPort } from '../ports/service-order-repository.port';
import { ServiceOrderTransition } from '../services/service-order-transition';
import { AssignMechanicUseCase } from './assign-mechanic.use-case';
import { AwaitApprovalUseCase } from './await-approval.use-case';
import { AwaitPartsUseCase } from './await-parts.use-case';
import { AwaitPaymentUseCase } from './await-payment.use-case';
import { CancelServiceOrderUseCase } from './cancel-service-order.use-case';
import { CompleteServiceOrderUseCase } from './complete-service-order.use-case';
import { DeliverServiceOrderUseCase } from './deliver-service-order.use-case';
import { FindServiceOrderUseCase } from './find-service-order.use-case';
import { GetAverageExecutionTimeUseCase } from './get-average-execution-time.use-case';
import { ListServiceOrdersByClientUseCase } from './list-service-orders-by-client.use-case';
import { ListServiceOrdersUseCase } from './list-service-orders.use-case';
import { OpenServiceOrderUseCase } from './open-service-order.use-case';
import { RegisterPartsDispatchedUseCase } from './register-parts-dispatched.use-case';

const CLIENT = 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const VEHICLE = 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const MECHANIC = 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const makeServiceOrder = (status = ServiceOrderStatus.RECEIVED) =>
  ServiceOrder.restore('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
    clientId: CLIENT,
    vehicleId: VEHICLE,
    description: 'Barulho no motor',
    status,
    // Depois de RECEIVED a OS sempre tem mecânico: é a atribuição que a tira
    // de lá, e sem mecânico ela não entra em execução.
    mechanicId: status === ServiceOrderStatus.RECEIVED ? null : MECHANIC,
  });

type MockedRepository = { [K in keyof ServiceOrderRepositoryPort]: jest.Mock };

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('Service order use cases without Nest', () => {
  let repository: MockedRepository;
  let clients: { exists: jest.Mock };
  let vehicles: { findById: jest.Mock };
  let services: { exists: jest.Mock };
  let parts: { exists: jest.Mock };
  let notifier: { statusChanged: jest.Mock };
  let transition: ServiceOrderTransition;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAllExcludingStatuses: jest.fn(),
      findByClientId: jest.fn(),
      findCompleted: jest.fn(),
      findActiveByMechanicId: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation((so: ServiceOrder) => so),
    };
    clients = { exists: jest.fn().mockResolvedValue(true) };
    vehicles = {
      findById: jest.fn().mockResolvedValue({ id: VEHICLE, clientId: CLIENT }),
    };
    services = { exists: jest.fn().mockResolvedValue(true) };
    parts = { exists: jest.fn().mockResolvedValue(true) };
    notifier = { statusChanged: jest.fn().mockResolvedValue(undefined) };
    transition = new ServiceOrderTransition(repository, notifier);
  });

  describe('open', () => {
    const input = {
      clientId: CLIENT,
      vehicleId: VEHICLE,
      description: 'Barulho',
    };
    const open = () =>
      new OpenServiceOrderUseCase(
        repository,
        clients,
        vehicles,
        services,
        parts,
      );

    it('abre a OS com os serviços e as peças pedidos, conferindo que existem', async () => {
      repository.create.mockImplementation((so: ServiceOrder) => so);

      const result = await open().execute({
        ...input,
        services: [{ serviceId: 'svc-1' }],
        parts: [{ partId: 'part-1', quantity: 4 }],
      });

      expect(services.exists).toHaveBeenCalledWith('svc-1');
      expect(parts.exists).toHaveBeenCalledWith('part-1');
      expect(result.getStatus()).toBe(ServiceOrderStatus.RECEIVED);
      expect(result.getRequestedServices()).toEqual([
        { serviceId: 'svc-1', quantity: 1 },
      ]);
      expect(result.getRequestedParts()).toEqual([
        { partId: 'part-1', quantity: 4 },
      ]);
    });

    it.each([
      ['CLIENT_NOT_FOUND', () => clients.exists.mockResolvedValue(false), {}],
      [
        'VEHICLE_NOT_FOUND',
        () => vehicles.findById.mockResolvedValue(null),
        {},
      ],
      [
        'VEHICLE_NOT_OWNED_BY_CLIENT',
        () =>
          vehicles.findById.mockResolvedValue({ id: VEHICLE, clientId: 'x' }),
        {},
      ],
      [
        'SERVICE_NOT_FOUND',
        () => services.exists.mockResolvedValue(false),
        { services: [{ serviceId: 'x' }] },
      ],
      [
        'PART_NOT_FOUND',
        () => parts.exists.mockResolvedValue(false),
        { parts: [{ partId: 'x', quantity: 1 }] },
      ],
    ] as const)('%s não grava a OS', async (code, arrange, extra) => {
      arrange();

      await expect(
        open().execute({ ...input, ...extra }),
      ).rejects.toMatchObject({ code });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('propaga erro de domínio quando a descrição é vazia', async () => {
      await expect(
        open().execute({ ...input, description: '' }),
      ).rejects.toThrow(DomainException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('find', () => {
    const find = () => new FindServiceOrderUseCase(repository);

    it('retorna a OS, inclusive ao CUSTOMER dono dela', async () => {
      const so = makeServiceOrder();
      repository.findById.mockResolvedValue(so);

      await expect(find().execute(so.getId())).resolves.toBe(so);
      await expect(find().execute(so.getId(), CLIENT)).resolves.toBe(so);
    });

    it('esconde do CUSTOMER a OS de outro cliente e falha para id inexistente', async () => {
      repository.findById.mockResolvedValueOnce(makeServiceOrder());
      await expect(find().execute('id', 'outro')).rejects.toMatchObject({
        code: 'SERVICE_ORDER_NOT_FOUND',
        message: 'Service order not found',
      });

      repository.findById.mockResolvedValueOnce(null);
      await expect(find().execute('id')).rejects.toThrow(
        ServiceOrderApplicationError,
      );
    });
  });

  it('list pede só as OS visíveis e ordena pela prioridade do status', async () => {
    const received = makeServiceOrder(ServiceOrderStatus.RECEIVED);
    const inProgress = makeServiceOrder(ServiceOrderStatus.IN_PROGRESS);
    repository.findAllExcludingStatuses.mockResolvedValue([
      received,
      inProgress,
    ]);

    await expect(
      new ListServiceOrdersUseCase(repository).execute(),
    ).resolves.toEqual([inProgress, received]);
    expect(repository.findAllExcludingStatuses).toHaveBeenCalledWith(
      ServiceOrder.STATUSES_HIDDEN_FROM_LISTING,
    );
  });

  describe('list by client', () => {
    it('devolve as OS do cliente, lista vazia inclusive', async () => {
      repository.findByClientId.mockResolvedValue([]);

      await expect(
        new ListServiceOrdersByClientUseCase(repository, clients).execute(
          CLIENT,
        ),
      ).resolves.toEqual([]);
      expect(repository.findByClientId).toHaveBeenCalledWith(CLIENT);
    });

    it('CLIENT_NOT_FOUND quando o cliente não existe', async () => {
      clients.exists.mockResolvedValue(false);

      await expect(
        new ListServiceOrdersByClientUseCase(repository, clients).execute(
          CLIENT,
        ),
      ).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
      expect(repository.findByClientId).not.toHaveBeenCalled();
    });
  });

  describe('average execution time', () => {
    it('null e amostra 0 sem OS finalizada', async () => {
      repository.findCompleted.mockResolvedValue([]);

      await expect(
        new GetAverageExecutionTimeUseCase(repository).execute(),
      ).resolves.toEqual({ averageExecutionTimeMs: null, sampleSize: 0 });
    });

    it('média entre assignedAt e completedAt', async () => {
      const assignedAt = new Date('2026-01-01T00:00:00.000Z');
      const make = (id: string, completedAt: string) =>
        ServiceOrder.restore(id, {
          clientId: CLIENT,
          vehicleId: VEHICLE,
          description: 'x',
          status: ServiceOrderStatus.COMPLETED,
          assignedAt,
          completedAt: new Date(completedAt),
        });
      repository.findCompleted.mockResolvedValue([
        make('a', '2026-01-01T01:00:00.000Z'),
        make('b', '2026-01-01T03:00:00.000Z'),
      ]);

      await expect(
        new GetAverageExecutionTimeUseCase(repository).execute(),
      ).resolves.toEqual({
        averageExecutionTimeMs: 2 * 60 * 60 * 1000,
        sampleSize: 2,
      });
    });
  });

  describe.each([
    [
      'awaitApproval',
      AwaitApprovalUseCase,
      ServiceOrderStatus.IN_DIAGNOSIS,
      ServiceOrderStatus.AWAITING_APPROVAL,
    ],
    [
      'awaitParts',
      AwaitPartsUseCase,
      ServiceOrderStatus.AWAITING_APPROVAL,
      ServiceOrderStatus.AWAITING_PARTS,
    ],
    [
      'registerPartsDispatched',
      RegisterPartsDispatchedUseCase,
      ServiceOrderStatus.AWAITING_PARTS,
      ServiceOrderStatus.IN_PROGRESS,
    ],
    [
      'complete',
      CompleteServiceOrderUseCase,
      ServiceOrderStatus.IN_PROGRESS,
      ServiceOrderStatus.COMPLETED,
    ],
    [
      'awaitPayment',
      AwaitPaymentUseCase,
      ServiceOrderStatus.COMPLETED,
      ServiceOrderStatus.AWAITING_PAYMENT,
    ],
    [
      'deliver',
      DeliverServiceOrderUseCase,
      ServiceOrderStatus.COMPLETED,
      ServiceOrderStatus.DELIVERED,
    ],
  ] as const)('%s', (_name, UseCase, from, expected) => {
    it(`transiciona de ${from} para ${expected} e persiste`, async () => {
      const so = makeServiceOrder(from);
      repository.findById.mockResolvedValue(so);

      const result = await new UseCase(transition).execute(so.getId());

      expect(result.getStatus()).toBe(expected);
      expect(repository.update).toHaveBeenCalledWith(so);
    });

    it('SERVICE_ORDER_NOT_FOUND quando a OS não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(new UseCase(transition).execute('x')).rejects.toMatchObject({
        code: 'SERVICE_ORDER_NOT_FOUND',
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('propaga erro de domínio em transição inválida e não persiste', async () => {
      repository.findById.mockResolvedValue(
        makeServiceOrder(ServiceOrderStatus.CANCELLED),
      );

      await expect(new UseCase(transition).execute('x')).rejects.toThrow(
        DomainException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancela com motivo e persiste', async () => {
      const so = makeServiceOrder();
      repository.findById.mockResolvedValue(so);

      const result = await new CancelServiceOrderUseCase(transition).execute(
        so.getId(),
        { reason: 'Cliente desistiu' },
      );

      expect(result.getStatus()).toBe(ServiceOrderStatus.CANCELLED);
      expect(result.getCancellationReason()).toBe('Cliente desistiu');
    });

    it('propaga erro de domínio quando o motivo é vazio', async () => {
      repository.findById.mockResolvedValue(makeServiceOrder());

      await expect(
        new CancelServiceOrderUseCase(transition).execute('x', { reason: ' ' }),
      ).rejects.toThrow(DomainException);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('assign mechanic', () => {
    it('atribui, inicia o timer e persiste', async () => {
      repository.findById.mockResolvedValue(makeServiceOrder());

      const result = await new AssignMechanicUseCase(
        repository,
        transition,
      ).execute('id', { mechanicId: MECHANIC });

      expect(result.getStatus()).toBe(ServiceOrderStatus.IN_DIAGNOSIS);
      expect(result.getAssignedAt()).toBeInstanceOf(Date);
    });

    it('MECHANIC_BUSY, com o id da OS ativa, quando o mecânico já tem OS em aberto', async () => {
      const active = makeServiceOrder(ServiceOrderStatus.IN_PROGRESS);
      repository.findById.mockResolvedValue(makeServiceOrder());
      repository.findActiveByMechanicId.mockResolvedValue(active);

      await expect(
        new AssignMechanicUseCase(repository, transition).execute('id', {
          mechanicId: MECHANIC,
        }),
      ).rejects.toMatchObject({
        code: 'MECHANIC_BUSY',
        kind: 'CONFLICT',
        message: `Mechanic already has an open service order (${active.getId()})`,
      });
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('aviso de mudança de status', () => {
    it('avisa o cliente com os dados de negócio da transição', async () => {
      const so = makeServiceOrder();
      repository.findById.mockResolvedValue(so);

      await new CancelServiceOrderUseCase(transition).execute(so.getId(), {
        reason: 'Desistiu',
      });
      await flush();

      expect(notifier.statusChanged).toHaveBeenCalledWith({
        clientId: CLIENT,
        serviceOrderId: so.getId(),
        status: ServiceOrderStatus.CANCELLED,
        cancellationReason: 'Desistiu',
      });
    });

    it('não avisa em AWAITING_APPROVAL: o email do orçamento já cobre essa etapa', async () => {
      repository.findById.mockResolvedValue(
        makeServiceOrder(ServiceOrderStatus.IN_DIAGNOSIS),
      );

      await new AwaitApprovalUseCase(transition).execute('id');
      await flush();

      expect(notifier.statusChanged).not.toHaveBeenCalled();
    });
  });
});
