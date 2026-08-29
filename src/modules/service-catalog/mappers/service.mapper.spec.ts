import { Service } from '../entities/service.entity';
import { ServiceMapper } from './service.mapper';
import { Money } from '../../../shared/domain/value-objects/money.vo';

describe('ServiceMapper', () => {
  it('devolve o preço em decimal, e não o Money', () => {
    const service = Service.create({
      name: 'Troca de óleo',
      description: 'Sintético',
      price: Money.fromDecimal(149.9),
    });

    const response = ServiceMapper.toResponse(service);

    expect(response).toEqual({
      id: service.getId(),
      name: 'Troca de óleo',
      description: 'Sintético',
      price: 149.9,
      createdAt: service.getCreatedAt(),
      updatedAt: service.getUpdatedAt(),
    });
  });

  it('devolve descrição ausente como null', () => {
    const service = Service.create({
      name: 'Alinhamento',
      price: Money.fromDecimal(80),
    });

    expect(ServiceMapper.toResponse(service).description).toBeNull();
  });

  it('mapeia listas', () => {
    const services = [
      Service.create({ name: 'A', price: Money.fromDecimal(10) }),
      Service.create({ name: 'B', price: Money.fromDecimal(20) }),
    ];

    expect(ServiceMapper.toResponseList(services).map((s) => s.name)).toEqual([
      'A',
      'B',
    ]);
  });
});
