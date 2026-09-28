import { Test, TestingModule } from '@nestjs/testing';
import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { AssignMechanicUseCase } from '../../application/use-cases/assign-mechanic.use-case';
import { CancelServiceOrderUseCase } from '../../application/use-cases/cancel-service-order.use-case';
import { CompleteServiceOrderUseCase } from '../../application/use-cases/complete-service-order.use-case';
import { FindServiceOrderUseCase } from '../../application/use-cases/find-service-order.use-case';
import { GetAverageExecutionTimeUseCase } from '../../application/use-cases/get-average-execution-time.use-case';
import { ListServiceOrdersByClientUseCase } from '../../application/use-cases/list-service-orders-by-client.use-case';
import { ListServiceOrdersUseCase } from '../../application/use-cases/list-service-orders.use-case';
import { OpenServiceOrderUseCase } from '../../application/use-cases/open-service-order.use-case';
import { ServiceOrderController } from './service-order.controller';

const makeServiceOrder = () =>
  ServiceOrder.create({
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Barulho no motor',
  });

describe('ServiceOrderController', () => {
  let controller: ServiceOrderController;
  let service: Record<
    | 'openServiceOrder'
    | 'findById'
    | 'findAll'
    | 'findByClientId'
    | 'assignToMechanic'
    | 'getAverageExecutionTime'
    | 'complete'
    | 'cancel',
    jest.Mock
  >;

  beforeEach(async () => {
    service = {
      openServiceOrder: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findByClientId: jest.fn(),
      assignToMechanic: jest.fn(),
      getAverageExecutionTime: jest.fn(),
      complete: jest.fn(),
      cancel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceOrderController],
      providers: [
        {
          provide: OpenServiceOrderUseCase,
          useValue: { execute: service.openServiceOrder },
        },
        {
          provide: ListServiceOrdersUseCase,
          useValue: { execute: service.findAll },
        },
        {
          provide: GetAverageExecutionTimeUseCase,
          useValue: { execute: service.getAverageExecutionTime },
        },
        {
          provide: ListServiceOrdersByClientUseCase,
          useValue: { execute: service.findByClientId },
        },
        {
          provide: FindServiceOrderUseCase,
          useValue: { execute: service.findById },
        },
        {
          provide: AssignMechanicUseCase,
          useValue: { execute: service.assignToMechanic },
        },
        {
          provide: CompleteServiceOrderUseCase,
          useValue: { execute: service.complete },
        },
        {
          provide: CancelServiceOrderUseCase,
          useValue: { execute: service.cancel },
        },
      ],
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

    await expect(controller.findAll()).resolves.toHaveLength(2);
  });

  it('getAverageExecutionTime repassa o resultado do caso de uso', async () => {
    service.getAverageExecutionTime.mockResolvedValue({
      averageExecutionTimeMs: 3600000,
      sampleSize: 2,
    });

    await expect(controller.getAverageExecutionTime()).resolves.toEqual({
      averageExecutionTimeMs: 3600000,
      sampleSize: 2,
    });
  });

  it('findByClientId e findMine usam a listagem por cliente', async () => {
    service.findByClientId.mockResolvedValue([makeServiceOrder()]);

    await controller.findByClientId('client-1');
    await controller.findMine({ clientId: 'client-2' } as never);

    expect(service.findByClientId).toHaveBeenNthCalledWith(1, 'client-1');
    expect(service.findByClientId).toHaveBeenNthCalledWith(2, 'client-2');
  });

  it('findById delega id e recorte de cliente', async () => {
    const serviceOrder = makeServiceOrder();
    service.findById.mockResolvedValue(serviceOrder);

    const response = await controller.findById(serviceOrder.getId());

    expect(service.findById).toHaveBeenCalledWith(
      serviceOrder.getId(),
      undefined,
    );
    expect(response.id).toBe(serviceOrder.getId());
  });

  it('assignToMechanic e complete delegam para os casos de uso', async () => {
    const serviceOrder = makeServiceOrder();
    service.assignToMechanic.mockResolvedValue(serviceOrder);
    service.complete.mockResolvedValue(serviceOrder);

    await controller.assignToMechanic(serviceOrder.getId(), {
      mechanicId: 'mech-1',
    });
    await controller.complete(serviceOrder.getId());

    expect(service.assignToMechanic).toHaveBeenCalledWith(
      serviceOrder.getId(),
      { mechanicId: 'mech-1' },
    );
    expect(service.complete).toHaveBeenCalledWith(serviceOrder.getId());
  });

  it('cancel repassa id e dto', async () => {
    const serviceOrder = makeServiceOrder();
    service.cancel.mockResolvedValue(serviceOrder);

    await controller.cancel(serviceOrder.getId(), { reason: 'Motivo' });

    expect(service.cancel).toHaveBeenCalledWith(serviceOrder.getId(), {
      reason: 'Motivo',
    });
  });
});
