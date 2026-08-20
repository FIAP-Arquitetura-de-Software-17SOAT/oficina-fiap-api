import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Client } from '../../client/entities/client.entity';
import { ClientRepository } from '../../client/repositories/client.repository';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';
import { ServiceOrderRepository } from '../repositories/service-order.repository';
import { ServiceOrderService } from './service-order.service';

const makeServiceOrder = (status = ServiceOrderStatus.RECEIVED) =>
  ServiceOrder.restore('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Barulho no motor',
    status,
  });

const makeClient = () =>
  Client.create({
    name: 'Maria Silva',
    document: '52998224725',
    email: 'maria@example.com',
    phone: '11999998888',
  });

type MockedRepository = { [K in keyof ServiceOrderRepository]: jest.Mock };
type MockedClientRepository = { [K in keyof ClientRepository]: jest.Mock };

describe('ServiceOrderService', () => {
  let service: ServiceOrderService;
  let repository: MockedRepository;
  let clientRepository: MockedClientRepository;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findCompleted: jest.fn(),
      update: jest.fn(),
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
        { provide: ClientRepository, useValue: clientRepository },
      ],
    }).compile();

    service = module.get<ServiceOrderService>(ServiceOrderService);
  });

  describe('openServiceOrder', () => {
    const dto = {
      clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      description: 'Barulho no motor',
    };

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

    it('lança NotFound quando não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('delega para o repositório', async () => {
      const serviceOrders = [makeServiceOrder()];
      repository.findAll.mockResolvedValue(serviceOrders);

      await expect(service.findAll()).resolves.toBe(serviceOrders);
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

    it('calcula a média entre createdAt e completedAt das OS finalizadas', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const completedFast = ServiceOrder.restore('a', {
        clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        description: 'x',
        status: ServiceOrderStatus.COMPLETED,
        createdAt,
        completedAt: new Date('2026-01-01T01:00:00.000Z'), // 1h
      });
      const completedSlow = ServiceOrder.restore('b', {
        clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        description: 'x',
        status: ServiceOrderStatus.DELIVERED,
        createdAt,
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
      'startDiagnosis',
      ServiceOrderStatus.RECEIVED,
      ServiceOrderStatus.IN_DIAGNOSIS,
    ],
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
      'startProgress',
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
});
