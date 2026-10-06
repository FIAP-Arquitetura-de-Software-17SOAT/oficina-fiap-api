import { Money } from '../../../../../shared/domain/value-objects/money.vo';
import { Service } from '../../../domain/entities/service.entity';
import { ServiceResponseMapper } from './service-response.mapper';

describe('ServiceResponseMapper', () => {
  it('devolve o preço em decimal, e não o Money', () => {
    const service = Service.create({
      name: 'Troca de óleo',
      description: 'Sintético',
      price: Money.fromDecimal(149.9),
    });

    const response = ServiceResponseMapper.toResponse(service);

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

    expect(ServiceResponseMapper.toResponse(service).description).toBeNull();
  });

  it('mapeia listas', () => {
    const services = [
      Service.create({ name: 'A', price: Money.fromDecimal(10) }),
      Service.create({ name: 'B', price: Money.fromDecimal(20) }),
    ];

    expect(
      ServiceResponseMapper.toResponseList(services).map((s) => s.name),
    ).toEqual(['A', 'B']);
  });
});
