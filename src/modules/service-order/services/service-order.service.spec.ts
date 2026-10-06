import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Client } from '../../client/domain/entities/client.entity';
import { ClientRepositoryPort } from '../../client/application/ports/client-repository.port';
import { NotificationType } from '../../notification/domain/enums/notification-type.enum';
import { EnqueueNotificationUseCase } from '../../notification/application/use-cases/enqueue-notification.use-case';
import { FindServiceUseCase } from '../../service-catalog/application/use-cases/find-service.use-case';
import { ServiceCatalogApplicationError } from '../../service-catalog/application/errors/service-catalog-application.error';
import { FindVehicleUseCase } from '../../vehicle/application/use-cases/find-vehicle.use-case';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';
import { FindPartUseCase } from '../../stock/application/use-cases/find-part.use-case';
import { StockApplicationError } from '../../stock/application/errors/stock-application.error';
import { ServiceOrderRepository } from '../repositories/service-order.repository';
import { ServiceOrderService } from './service-order.service';

const makeServiceOrder = (status = ServiceOrderStatus.RECEIVED) =>
  ServiceOrder.restore('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Barulho no motor',
    status,
    // Depois de RECEIVED a OS sempre tem mecânico: é a atribuição que a tira
    // de lá, e sem mecânico ela não entra em execução.
    mechanicId:
      status === ServiceOrderStatus.RECEIVED
        ? null
        : 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  });

const makeClient = () =>
  Client.create({
    name: 'Maria Silva',
    document: '52998224725',
    email: 'maria@example.com',
    phone: '11999998888',
  });

type MockedRepository = { [K in keyof ServiceOrderRepository]: jest.Mock };
type MockedClientRepository = { [K in keyof ClientRepositoryPort]: jest.Mock };

describe('ServiceOrderService', () => {
  let service: ServiceOrderService;
  let repository: MockedRepository;
  let clientRepository: MockedClientRepository;
  let findVehicle: { execute: jest.Mock };
  let serviceCatalog: { execute: jest.Mock };
  let partCatalog: { execute: jest.Mock };
  let notifications: { execute: jest.Mock };

  beforeEach(async () => {
    serviceCatalog = { execute: jest.fn().mockResolvedValue({}) };
    partCatalog = { execute: jest.fn().mockResolvedValue({}) };
    notifications = { execute: jest.fn().mockResolvedValue(undefined) };
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAllExcludingStatuses: jest.fn(),
      findByClientId: jest.fn(),
      findCompleted: jest.fn(),
      findActiveByMechanicId: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    // por padrão o veículo existe e pertence ao cliente da OS
    findVehicle = {
      execute: jest.fn().mockResolvedValue({
        getClientId: () => 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      }),
    };
    clientRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByDocument: jest.fn(),
      findByEmail: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceOrderService,
        { provide: ServiceOrderRepository, useValue: repository },
        { provide: ClientRepositoryPort, useValue: clientRepository },
        { provide: FindVehicleUseCase, useValue: findVehicle },
        { provide: FindServiceUseCase, useValue: serviceCatalog },
        { provide: FindPartUseCase, useValue: partCatalog },
        { provide: EnqueueNotificationUseCase, useValue: notifications },
      ],
    }).compile();

    service = module.get<ServiceOrderService>(ServiceOrderService);
  });

  describe('openServiceOrder', () => {
    it('recusa abrir OS com veículo de outro cliente', async () => {
      clientRepository.findById.mockResolvedValue({});
      findVehicle.execute.mockResolvedValue({
        getClientId: () => 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      });

      await expect(service.openServiceOrder(dto)).rejects.toThrow(
        'Vehicle does not belong to the informed client',
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    const dto = {
      clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      description: 'Barulho no motor',
    };

    it('abre a OS com os serviços e as peças pedidos, conferindo que existem', async () => {
      clientRepository.findById.mockResolvedValue(makeClient());
      repository.create.mockImplementation((so: ServiceOrder) => so);

      const result = await service.openServiceOrder({
        ...dto,
        services: [{ serviceId: 'svc-1' }],
        parts: [{ partId: 'part-1', quantity: 4 }],
      });

      expect(serviceCatalog.execute).toHaveBeenCalledWith('svc-1');
      expect(partCatalog.execute).toHaveBeenCalledWith('part-1');
      expect(result.getRequestedServices()).toEqual([
        { serviceId: 'svc-1', quantity: 1 },
      ]);
      expect(result.getRequestedParts()).toEqual([
        { partId: 'part-1', quantity: 4 },
      ]);
    });

    it('não grava a OS quando um serviço pedido não existe', async () => {
      clientRepository.findById.mockResolvedValue(makeClient());
      serviceCatalog.execute.mockRejectedValue(
        new ServiceCatalogApplicationError('SERVICE_NOT_FOUND'),
      );

      await expect(
        service.openServiceOrder({ ...dto, services: [{ serviceId: 'x' }] }),
      ).rejects.toThrow(ServiceCatalogApplicationError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('não grava a OS quando uma peça pedida não existe', async () => {
      clientRepository.findById.mockResolvedValue(makeClient());
      partCatalog.execute.mockRejectedValue(
        new StockApplicationError('PART_NOT_FOUND'),
      );

      await expect(
        service.openServiceOrder({
          ...dto,
          parts: [{ partId: 'x', quantity: 1 }],
        }),
      ).rejects.toThrow(StockApplicationError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('abre a OS quando o cliente existe', async () => {
      clientRepository.findById.mockResolvedValue(makeClient());
      repository.create.mockImplementation((so: ServiceOrder) => so);

      const created = await service.openServiceOrder(dto);

      expect(created.getStatus()).toBe(ServiceOrderStatus.RECEIVED);
      expect(clientRepository.findById).toHaveBeenCalledWith(dto.clientId);
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('propaga NotFound quando o cliente não existe', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(service.openServiceOrder(dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('propaga erro de domínio quando a descrição é vazia', async () => {
      clientRepository.findById.mockResolvedValue(makeClient());

      await expect(
        service.openServiceOrder({ ...dto, description: '' }),
      ).rejects.toThrow(DomainException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('retorna a OS encontrada', async () => {
      const serviceOrder = makeServiceOrder();
      repository.findById.mockResolvedValue(serviceOrder);

      await expect(service.findById(serviceOrder.getId())).resolves.toBe(
        serviceOrder,
      );
    });

    it('entrega ao CUSTOMER a OS do próprio cliente', async () => {
      const serviceOrder = makeServiceOrder();
      repository.findById.mockResolvedValue(serviceOrder);

      await expect(
        service.findById(serviceOrder.getId(), serviceOrder.getClientId()),
      ).resolves.toBe(serviceOrder);
    });

    it('esconde do CUSTOMER a OS de outro cliente, como se não existisse', async () => {
      const serviceOrder = makeServiceOrder();
      repository.findById.mockResolvedValue(serviceOrder);

      await expect(
        service.findById(
          serviceOrder.getId(),
          'dddddddd-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('lança NotFound quando não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('pede ao repositório só as OS visíveis na listagem', async () => {
      repository.findAllExcludingStatuses.mockResolvedValue([]);

      await service.findAll();

      expect(repository.findAllExcludingStatuses).toHaveBeenCalledWith(
        ServiceOrder.STATUSES_HIDDEN_FROM_LISTING,
      );
    });

    it('ordena pela prioridade do status', async () => {
      const received = makeServiceOrder(ServiceOrderStatus.RECEIVED);
      const inProgress = makeServiceOrder(ServiceOrderStatus.IN_PROGRESS);
      repository.findAllExcludingStatuses.mockResolvedValue([
        received,
        inProgress,
      ]);

      await expect(service.findAll()).resolves.toEqual([inProgress, received]);
    });
  });

  describe('getAverageExecutionTime', () => {
    it('retorna null e amostra 0 quando não há OS finalizada', async () => {
      repository.findCompleted.mockResolvedValue([]);

      await expect(service.getAverageExecutionTime()).resolves.toEqual({
        averageExecutionTimeMs: null,
        sampleSize: 0,
      });
    });

    it('calcula a média entre assignedAt e completedAt das OS finalizadas', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      // O timer começa na atribuição ao mecânico, não na abertura da OS.
      const assignedAt = new Date('2026-01-01T00:00:00.000Z');
      const completedFast = ServiceOrder.restore('a', {
        clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        description: 'x',
        status: ServiceOrderStatus.COMPLETED,
        createdAt,
        assignedAt,
        completedAt: new Date('2026-01-01T01:00:00.000Z'), // 1h
      });
      const completedSlow = ServiceOrder.restore('b', {
        clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        description: 'x',
        status: ServiceOrderStatus.DELIVERED,
        createdAt,
        assignedAt,
        completedAt: new Date('2026-01-01T03:00:00.000Z'), // 3h
      });
      repository.findCompleted.mockResolvedValue([
        completedFast,
        completedSlow,
      ]);

      const result = await service.getAverageExecutionTime();

      expect(result.sampleSize).toBe(2);
      expect(result.averageExecutionTimeMs).toBe(2 * 60 * 60 * 1000); // média de 1h e 3h
    });
  });

  describe.each([
    [
      'awaitApproval',
      ServiceOrderStatus.IN_DIAGNOSIS,
      ServiceOrderStatus.AWAITING_APPROVAL,
    ],
    [
      'awaitParts',
      ServiceOrderStatus.AWAITING_APPROVAL,
      ServiceOrderStatus.AWAITING_PARTS,
    ],
    [
      'registerPartsDispatched',
      ServiceOrderStatus.AWAITING_PARTS,
      ServiceOrderStatus.IN_PROGRESS,
    ],
    ['complete', ServiceOrderStatus.IN_PROGRESS, ServiceOrderStatus.COMPLETED],
    ['deliver', ServiceOrderStatus.COMPLETED, ServiceOrderStatus.DELIVERED],
  ] as const)('%s', (method, from, expected) => {
    it(`transiciona de ${from} para ${expected} e persiste`, async () => {
      const serviceOrder = makeServiceOrder(from);
      repository.findById.mockResolvedValue(serviceOrder);
      repository.update.mockImplementation((so: ServiceOrder) => so);

      const result = await service[method](serviceOrder.getId());

      expect(result.getStatus()).toBe(expected);
      expect(repository.update).toHaveBeenCalledWith(serviceOrder);
    });

    it('lança NotFound quando a OS não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service[method]('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('propaga erro de domínio em transição inválida e não persiste', async () => {
      const serviceOrder = makeServiceOrder(ServiceOrderStatus.CANCELLED);
      repository.findById.mockResolvedValue(serviceOrder);

      await expect(service[method](serviceOrder.getId())).rejects.toThrow(
        DomainException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancela com motivo e persiste', async () => {
      const serviceOrder = makeServiceOrder(ServiceOrderStatus.RECEIVED);
      repository.findById.mockResolvedValue(serviceOrder);
      repository.update.mockImplementation((so: ServiceOrder) => so);

      const result = await service.cancel(serviceOrder.getId(), {
        reason: 'Cliente desistiu',
      });

      expect(result.getStatus()).toBe(ServiceOrderStatus.CANCELLED);
      expect(result.getCancellationReason()).toBe('Cliente desistiu');
    });

    it('lança NotFound quando a OS não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.cancel('id-inexistente', { reason: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propaga erro de domínio quando o motivo é vazio', async () => {
      const serviceOrder = makeServiceOrder(ServiceOrderStatus.RECEIVED);
      repository.findById.mockResolvedValue(serviceOrder);

      await expect(
        service.cancel(serviceOrder.getId(), { reason: '  ' }),
      ).rejects.toThrow(DomainException);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });
  describe('assignToMechanic', () => {
    const MECHANIC = 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

    it('atribui, inicia o timer e persiste', async () => {
      const os = makeServiceOrder();
      repository.findById.mockResolvedValue(os);
      repository.findActiveByMechanicId.mockResolvedValue(null);
      repository.update.mockImplementation((entity: ServiceOrder) => entity);

      const result = await service.assignToMechanic('id', {
        mechanicId: MECHANIC,
      });

      expect(result.getStatus()).toBe(ServiceOrderStatus.IN_DIAGNOSIS);
      expect(result.getAssignedAt()).toBeInstanceOf(Date);
      expect(repository.update).toHaveBeenCalledTimes(1);
    });

    it('recusa quando o mecânico já tem OS em aberto', async () => {
      const emAberto = makeServiceOrder();
      repository.findById.mockResolvedValue(makeServiceOrder());
      repository.findActiveByMechanicId.mockResolvedValue(emAberto);

      await expect(
        service.assignToMechanic('id', { mechanicId: MECHANIC }),
      ).rejects.toThrow('Mechanic already has an open service order');
      expect(repository.update).not.toHaveBeenCalled();
    });
  });
  describe('findByClientId', () => {
    const CLIENT = 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

    it('devolve as OS do cliente para acompanhamento', async () => {
      clientRepository.findById.mockResolvedValue(makeClient());
      const orders = [makeServiceOrder()];
      repository.findByClientId.mockResolvedValue(orders);

      await expect(service.findByClientId(CLIENT)).resolves.toBe(orders);
      expect(repository.findByClientId).toHaveBeenCalledWith(CLIENT);
    });

    it('cliente sem OS devolve lista vazia, não erro', async () => {
      clientRepository.findById.mockResolvedValue(makeClient());
      repository.findByClientId.mockResolvedValue([]);

      await expect(service.findByClientId(CLIENT)).resolves.toEqual([]);
    });

    it('404 quando o cliente não existe', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(service.findByClientId(CLIENT)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findByClientId).not.toHaveBeenCalled();
    });
  });

  describe('aviso de mudança de status por email', () => {
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    beforeEach(() => {
      clientRepository.findById.mockResolvedValue(makeClient());
      repository.update.mockImplementation((so: ServiceOrder) => so);
    });

    it('avisa o cliente quando a OS muda de status', async () => {
      const serviceOrder = makeServiceOrder(ServiceOrderStatus.RECEIVED);
      repository.findById.mockResolvedValue(serviceOrder);

      await service.cancel(serviceOrder.getId(), { reason: 'Desistiu' });
      await flush();

      expect(clientRepository.findById).toHaveBeenCalledWith(
        serviceOrder.getClientId(),
      );
      expect(notifications.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.SERVICE_ORDER_STATUS_CHANGED,
          to: 'maria@example.com',
          subject: `A OS ${serviceOrder.getId()} está Cancelada`,
        }),
      );
    });

    it.each([
      ['assignToMechanic', ServiceOrderStatus.RECEIVED],
      ['awaitParts', ServiceOrderStatus.AWAITING_APPROVAL],
      ['registerPartsDispatched', ServiceOrderStatus.AWAITING_PARTS],
      ['complete', ServiceOrderStatus.IN_PROGRESS],
      ['awaitPayment', ServiceOrderStatus.COMPLETED],
      ['deliver', ServiceOrderStatus.COMPLETED],
    ] as const)('avisa em %s', async (method, from) => {
      const serviceOrder = makeServiceOrder(from);
      repository.findById.mockResolvedValue(serviceOrder);

      if (method === 'assignToMechanic') {
        await service.assignToMechanic(serviceOrder.getId(), {
          mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        });
      } else {
        await service[method](serviceOrder.getId());
      }
      await flush();

      expect(notifications.execute).toHaveBeenCalledTimes(1);
    });

    it('não avisa em AWAITING_APPROVAL: o email do orçamento já cobre essa etapa', async () => {
      const serviceOrder = makeServiceOrder(ServiceOrderStatus.IN_DIAGNOSIS);
      repository.findById.mockResolvedValue(serviceOrder);

      await service.awaitApproval(serviceOrder.getId());
      await flush();

      expect(notifications.execute).not.toHaveBeenCalled();
    });

    it('falha ao montar o aviso não desfaz a mudança de status', async () => {
      const serviceOrder = makeServiceOrder(ServiceOrderStatus.RECEIVED);
      repository.findById.mockResolvedValue(serviceOrder);
      clientRepository.findById.mockRejectedValue(new Error('db down'));

      const result = await service.cancel(serviceOrder.getId(), {
        reason: 'Desistiu',
      });
      await flush();

      expect(result.getStatus()).toBe(ServiceOrderStatus.CANCELLED);
      expect(notifications.execute).not.toHaveBeenCalled();
    });
  });
});
