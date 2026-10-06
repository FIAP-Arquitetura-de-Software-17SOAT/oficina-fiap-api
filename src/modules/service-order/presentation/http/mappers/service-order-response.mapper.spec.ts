import { ServiceOrder } from '../../../domain/entities/service-order.entity';
import { ServiceOrderStatus } from '../../../domain/enums/service-order-status.enum';
import { ServiceOrderResponseMapper } from './service-order-response.mapper';

const makeServiceOrder = () =>
  ServiceOrder.create({
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Barulho no motor',
  });

describe('ServiceOrderResponseMapper', () => {
  it('desembrulha a entidade em campos primitivos', () => {
    const response = ServiceOrderResponseMapper.toResponse(makeServiceOrder());

    expect(response).toEqual({
      id: expect.any(String) as string,
      clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      description: 'Barulho no motor',
      services: [],
      parts: [],
      status: ServiceOrderStatus.RECEIVED,
      cancellationReason: null,
      mechanicId: null,
      assignedAt: null,
      partsDispatchedAt: null,
      completedAt: null,
      executionTimeMs: null,
      createdAt: expect.any(Date) as Date,
      updatedAt: expect.any(Date) as Date,
    });
  });

  it('mapeia listas preservando a ordem', () => {
    const a = makeServiceOrder();
    const b = makeServiceOrder();

    const responses = ServiceOrderResponseMapper.toResponseList([a, b]);

    expect(responses.map((r) => r.id)).toEqual([a.getId(), b.getId()]);
  });

  it('mapeia lista vazia', () => {
    expect(ServiceOrderResponseMapper.toResponseList([])).toEqual([]);
  });
});
