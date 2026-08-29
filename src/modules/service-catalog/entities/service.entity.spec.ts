import { DomainException } from '../../../shared/domain/domain.exception';
import { Service } from './service.entity';

describe('Service (entidade)', () => {
  it('cria o serviço normalizando nome e descrição e guardando o preço em centavos', () => {
    const service = Service.create({
      name: '  Troca de óleo  ',
      description: '  Óleo sintético  ',
      price: 149.9,
    });

    expect(service.getId()).toHaveLength(36);
    expect(service.getName()).toBe('Troca de óleo');
    expect(service.getDescription()).toBe('Óleo sintético');
    expect(service.getPrice().valueInCents).toBe(14990);
    expect(service.getPrice().value).toBe(149.9);
  });

  it.each([[undefined], [null], ['   ']])(
    'trata descrição %p como ausente',
    (description) => {
      const service = Service.create({
        name: 'Alinhamento',
        description,
        price: 80,
      });

      expect(service.getDescription()).toBeUndefined();
    },
  );

  it.each([[''], ['   ']])('recusa nome vazio (%p)', (name) => {
    expect(() => Service.create({ name, price: 10 })).toThrow(DomainException);
  });

  it('recusa preço zero', () => {
    expect(() => Service.create({ name: 'Revisão', price: 0 })).toThrow(
      'Preço do serviço deve ser maior que zero',
    );
  });

  it('recusa preço negativo', () => {
    expect(() => Service.create({ name: 'Revisão', price: -1 })).toThrow(
      DomainException,
    );
  });

  it('recusa preço não numérico', () => {
    expect(() =>
      Service.create({ name: 'Revisão', price: Number.NaN }),
    ).toThrow(DomainException);
  });

  it('restaura mantendo id e datas de origem', () => {
    const createdAt = new Date('2026-01-01T10:00:00.000Z');
    const updatedAt = new Date('2026-01-02T10:00:00.000Z');

    const service = Service.restore('service-1', {
      name: 'Balanceamento',
      description: null,
      price: 60,
      createdAt,
      updatedAt,
    });

    expect(service.getId()).toBe('service-1');
    expect(service.getCreatedAt()).toBe(createdAt);
    expect(service.getUpdatedAt()).toBe(updatedAt);
    expect(service.getDescription()).toBeUndefined();
  });

  it('atualiza nome, descrição e preço carimbando updatedAt', () => {
    const service = Service.restore('service-1', {
      name: 'Balanceamento',
      description: 'Antigo',
      price: 60,
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
      updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    });
    const before = service.getUpdatedAt().getTime();

    service.changeName('  Balanceamento das quatro rodas ');
    service.changeDescription('  Inclui pesos  ');
    service.changePrice(99.99);

    expect(service.getName()).toBe('Balanceamento das quatro rodas');
    expect(service.getDescription()).toBe('Inclui pesos');
    expect(service.getPrice().valueInCents).toBe(9999);
    expect(service.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(before);
  });

  it('limpa a descrição quando recebe null', () => {
    const service = Service.create({
      name: 'Revisão',
      description: 'Alguma coisa',
      price: 10,
    });

    service.changeDescription(null);

    expect(service.getDescription()).toBeUndefined();
  });

  it('recusa alteração para nome vazio', () => {
    const service = Service.create({ name: 'Revisão', price: 10 });

    expect(() => service.changeName(' ')).toThrow(DomainException);
    expect(service.getName()).toBe('Revisão');
  });
});
