import { Test, TestingModule } from '@nestjs/testing';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderService } from '../services/service-order.service';
import { ServiceOrderController } from './service-order.controller';

const makeServiceOrder = () =>
  ServiceOrder.create({
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Barulho no motor',
  });

describe('ServiceOrderController', () => {
  let controller: ServiceOrderController;
  let service: { [K in keyof ServiceOrderService]: jest.Mock };

  beforeEach(async () => {
    service = {
      openServiceOrder: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      getAverageExecutionTime: jest.fn(),
      startDiagnosis: jest.fn(),
      awaitApproval: jest.fn(),
      awaitParts: jest.fn(),
      startProgress: jest.fn(),
      complete: jest.fn(),
      deliver: jest.fn(),
      cancel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceOrderController],
      providers: [{ provide: ServiceOrderService, useValue: service }],
    }).compile();

    controller = module.get<ServiceOrderController>(ServiceOrderController);
  });

  it('openServiceOrder devolve o DTO mapeado', async () => {
    const serviceOrder = makeServiceOrder();
    service.openServiceOrder.mockResolvedValue(serviceOrder);
    const dto = {
      clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      description: 'Barulho no motor',
    };

    const response = await controller.openServiceOrder(dto);

    expect(service.openServiceOrder).toHaveBeenCalledWith(dto);
    expect(response.id).toBe(serviceOrder.getId());
    expect(response.status).toBe('RECEIVED');
  });

  it('findAll mapeia a lista inteira', async () => {
    service.findAll.mockResolvedValue([makeServiceOrder(), makeServiceOrder()]);

    const response = await controller.findAll();

    expect(response).toHaveLength(2);
  });

  it('getAverageExecutionTime repassa o resultado do service', async () => {
    service.getAverageExecutionTime.mockResolvedValue({
      averageExecutionTimeMs: 3600000,
      sampleSize: 2,
    });

    const response = await controller.getAverageExecutionTime();

    expect(response).toEqual({
      averageExecutionTimeMs: 3600000,
      sampleSize: 2,
    });
  });

  it('findById delega o id para o service', async () => {
    const serviceOrder = makeServiceOrder();
    service.findById.mockResolvedValue(serviceOrder);

    const response = await controller.findById(serviceOrder.getId());

    expect(service.findById).toHaveBeenCalledWith(serviceOrder.getId());
    expect(response.id).toBe(serviceOrder.getId());
  });

  it.each([
    ['startDiagnosis', 'startDiagnosis'],
    ['awaitApproval', 'awaitApproval'],
    ['awaitParts', 'awaitParts'],
    ['startProgress', 'startProgress'],
    ['complete', 'complete'],
  ] as const)(
    '%s delega o id para o service',
    async (method, serviceMethod) => {
      const serviceOrder = makeServiceOrder();
      service[serviceMethod].mockResolvedValue(serviceOrder);

      const response = await controller[method](serviceOrder.getId());

      expect(service[serviceMethod]).toHaveBeenCalledWith(serviceOrder.getId());
      expect(response.id).toBe(serviceOrder.getId());
    },
  );

  it('cancel repassa id e dto', async () => {
    const serviceOrder = makeServiceOrder();
    service.cancel.mockResolvedValue(serviceOrder);

    await controller.cancel(serviceOrder.getId(), { reason: 'Motivo' });

    expect(service.cancel).toHaveBeenCalledWith(serviceOrder.getId(), {
      reason: 'Motivo',
    });
  });
});
