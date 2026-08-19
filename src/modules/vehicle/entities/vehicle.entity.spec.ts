import { DomainException } from '../../../shared/domain/domain.exception';
import { Vehicle, VehicleProps } from './vehicle.entity';

const CLIENT_ID = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const VEHICLE_ID = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const validProps = (overrides: Partial<VehicleProps> = {}): VehicleProps => ({
  clientId: CLIENT_ID,
  plate: 'ABC1D23',
  brand: 'Fiat',
  model: 'Argo',
  year: 2022,
  ...overrides,
});

describe('Vehicle', () => {
  describe('create', () => {
    it('gera um id novo', () => {
      expect(Vehicle.create(validProps()).getId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('expõe placa e ano como Value Objects', () => {
      const vehicle = Vehicle.create(validProps());

      expect(vehicle.getPlate().getValue()).toBe('ABC1D23');
      expect(vehicle.getYear().getValue()).toBe(2022);
    });

    it('normaliza os dados na construção', () => {
      const vehicle = Vehicle.create(
        validProps({
          plate: '  abc-1d23 ',
          brand: '  Fiat  ',
          model: '  Argo  ',
        }),
      );

      expect(vehicle.getPlate().getValue()).toBe('ABC1D23');
      expect(vehicle.getBrand()).toBe('Fiat');
      expect(vehicle.getModel()).toBe('Argo');
    });

    it('define createdAt e updatedAt quando não informados', () => {
      const vehicle = Vehicle.create(validProps());

      expect(vehicle.getCreatedAt()).toBeInstanceOf(Date);
      expect(vehicle.getUpdatedAt()).toBeInstanceOf(Date);
    });
  });

  describe('invariantes', () => {
    it.each([
      ['sem cliente', { clientId: '   ' }, 'Veículo precisa de um cliente'],
      ['placa inválida', { plate: 'ABCD123' }, 'Placa inválida'],
      ['marca vazia', { brand: '  ' }, 'Marca do veículo é obrigatória'],
      ['modelo vazio', { model: '' }, 'Modelo do veículo é obrigatório'],
    ])('recusa veículo %s', (_label, overrides, message) => {
      expect(() => Vehicle.create(validProps(overrides))).toThrow(message);
    });

    it('recusa ano fora da faixa', () => {
      expect(() => Vehicle.create(validProps({ year: 1800 }))).toThrow(
        DomainException,
      );
    });

    it.each([['clientId'], ['plate'], ['brand'], ['model']])(
      'recusa %s nulo vindo de fora do TypeScript',
      (field) => {
        expect(() =>
          Vehicle.create(validProps({ [field]: null as unknown as string })),
        ).toThrow(DomainException);
      },
    );
  });

  describe('restore', () => {
    it('preserva o id e as datas vindas do banco', () => {
      const createdAt = new Date('2026-01-01T10:00:00.000Z');
      const updatedAt = new Date('2026-02-01T10:00:00.000Z');

      const vehicle = Vehicle.restore(
        VEHICLE_ID,
        validProps({ createdAt, updatedAt }),
      );

      expect(vehicle.getId()).toBe(VEHICLE_ID);
      expect(vehicle.getCreatedAt()).toBe(createdAt);
      expect(vehicle.getUpdatedAt()).toBe(updatedAt);
    });
  });

  describe('alterações', () => {
    const oldDate = new Date('2020-01-01T00:00:00.000Z');

    const restored = () =>
      Vehicle.restore(
        VEHICLE_ID,
        validProps({ createdAt: oldDate, updatedAt: oldDate }),
      );

    it('changeBrand atualiza a marca e toca updatedAt', () => {
      const vehicle = restored();

      vehicle.changeBrand('Volkswagen');

      expect(vehicle.getBrand()).toBe('Volkswagen');
      expect(vehicle.getUpdatedAt().getTime()).toBeGreaterThan(
        oldDate.getTime(),
      );
    });

    it('changeModel atualiza o modelo', () => {
      const vehicle = restored();

      vehicle.changeModel('Polo');

      expect(vehicle.getModel()).toBe('Polo');
    });

    it('changeYear atualiza o ano', () => {
      const vehicle = restored();

      vehicle.changeYear(2023);

      expect(vehicle.getYear().getValue()).toBe(2023);
    });

    it.each([
      ['changeBrand', (v: Vehicle) => v.changeBrand('')],
      ['changeModel', (v: Vehicle) => v.changeModel('  ')],
      ['changeYear', (v: Vehicle) => v.changeYear(1800)],
    ])('%s recusa valor inválido e mantém o estado anterior', (_label, act) => {
      const vehicle = restored();

      expect(() => act(vehicle)).toThrow(DomainException);
      expect(vehicle.getBrand()).toBe('Fiat');
      expect(vehicle.getModel()).toBe('Argo');
      expect(vehicle.getYear().getValue()).toBe(2022);
      expect(vehicle.getUpdatedAt()).toBe(oldDate);
    });

    it.each([['changePlate'], ['changeClientId']])(
      'não expõe %s: placa e dono identificam o veículo',
      (method) => {
        const vehicle = restored() as unknown as Record<string, unknown>;

        expect(vehicle[method]).toBeUndefined();
      },
    );
  });
});
