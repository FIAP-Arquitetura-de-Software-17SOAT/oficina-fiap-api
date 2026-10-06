import { DomainException } from '../../../../shared/domain/domain.exception';
import { Vehicle } from '../../domain/entities/vehicle.entity';
import { VehicleApplicationError } from '../errors/vehicle-application.error';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { VehicleRepositoryPort } from '../ports/vehicle-repository.port';
import { CreateVehicleUseCase } from './create-vehicle.use-case';
import { DeleteVehicleUseCase } from './delete-vehicle.use-case';
import { FindVehicleUseCase } from './find-vehicle.use-case';
import { ListVehiclesUseCase } from './list-vehicles.use-case';
import { UpdateVehicleUseCase } from './update-vehicle.use-case';

const CLIENT_ID = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const makeVehicle = (plate = 'ABC1D23') =>
  Vehicle.create({
    clientId: CLIENT_ID,
    plate,
    brand: 'Fiat',
    model: 'Argo',
    year: 2022,
  });

type MockedRepository = { [K in keyof VehicleRepositoryPort]: jest.Mock };
type MockedClients = { [K in keyof ClientLookupPort]: jest.Mock };

describe('Vehicle use cases without Nest', () => {
  let repository: MockedRepository;
  let clients: MockedClients;
  let service: {
    create: CreateVehicleUseCase['execute'];
    findById: FindVehicleUseCase['execute'];
    findAll: ListVehiclesUseCase['execute'];
    update: UpdateVehicleUseCase['execute'];
    delete: DeleteVehicleUseCase['execute'];
  };

  const input = {
    clientId: CLIENT_ID,
    plate: 'abc-1d23',
    brand: 'Fiat',
    model: 'Argo',
    year: 2022,
  };

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByPlate: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    clients = { exists: jest.fn().mockResolvedValue(true) };

    service = {
      create: (i) => new CreateVehicleUseCase(repository, clients).execute(i),
      findById: (id) => new FindVehicleUseCase(repository).execute(id),
      findAll: (clientId) =>
        new ListVehiclesUseCase(repository, clients).execute(clientId),
      update: (id, i) => new UpdateVehicleUseCase(repository).execute(id, i),
      delete: (id) => new DeleteVehicleUseCase(repository).execute(id),
    };
  });

  describe('create', () => {
    it('persiste o veículo quando cliente existe e placa está livre', async () => {
      repository.findByPlate.mockResolvedValue(null);
      repository.create.mockImplementation((v: Vehicle) => v);

      const created = await service.create(input);

      expect(created.getPlate().getValue()).toBe('ABC1D23');
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('consulta a placa já normalizada, sem máscara', async () => {
      repository.findByPlate.mockResolvedValue(null);
      repository.create.mockImplementation((v: Vehicle) => v);

      await service.create(input);

      expect(repository.findByPlate).toHaveBeenCalledWith('ABC1D23');
    });

    it('recusa quando o cliente não existe, sem gravar veículo órfão', async () => {
      clients.exists.mockResolvedValue(false);

      await expect(service.create(input)).rejects.toMatchObject({
        code: 'CLIENT_NOT_FOUND',
        kind: 'NOT_FOUND',
        message: 'Client not found',
      });
      expect(repository.findByPlate).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('recusa placa já cadastrada', async () => {
      repository.findByPlate.mockResolvedValue(makeVehicle());

      await expect(service.create(input)).rejects.toMatchObject({
        code: 'VEHICLE_ALREADY_EXISTS',
        kind: 'CONFLICT',
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('recusa placa inválida antes de tocar em qualquer porta', async () => {
      await expect(
        service.create({ ...input, plate: 'ABCD123' }),
      ).rejects.toThrow(DomainException);

      expect(clients.exists).not.toHaveBeenCalled();
      expect(repository.findByPlate).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('retorna o veículo encontrado', async () => {
      const vehicle = makeVehicle();
      repository.findById.mockResolvedValue(vehicle);

      await expect(service.findById(vehicle.getId())).resolves.toBe(vehicle);
    });

    it('lança VEHICLE_NOT_FOUND quando não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('inexistente')).rejects.toMatchObject({
        code: 'VEHICLE_NOT_FOUND',
        message: 'Vehicle not found',
      });
    });
  });

  describe('findAll', () => {
    it('lista todos quando não há filtro', async () => {
      const vehicles = [makeVehicle()];
      repository.findAll.mockResolvedValue(vehicles);

      await expect(service.findAll()).resolves.toBe(vehicles);
      expect(clients.exists).not.toHaveBeenCalled();
      expect(repository.findAll).toHaveBeenCalledWith(undefined);
    });

    it('filtra por cliente e valida que ele existe', async () => {
      repository.findAll.mockResolvedValue([]);

      await service.findAll(CLIENT_ID);

      expect(clients.exists).toHaveBeenCalledWith(CLIENT_ID);
      expect(repository.findAll).toHaveBeenCalledWith(CLIENT_ID);
    });

    it('lança CLIENT_NOT_FOUND ao filtrar por cliente inexistente', async () => {
      clients.exists.mockResolvedValue(false);

      await expect(service.findAll(CLIENT_ID)).rejects.toThrow(
        VehicleApplicationError,
      );
      expect(repository.findAll).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('aplica apenas os campos enviados', async () => {
      const vehicle = makeVehicle();
      repository.findById.mockResolvedValue(vehicle);
      repository.update.mockImplementation((v: Vehicle) => v);

      const updated = await service.update(vehicle.getId(), {
        brand: 'Volkswagen',
      });

      expect(updated.getBrand()).toBe('Volkswagen');
      expect(updated.getModel()).toBe('Argo');
      expect(updated.getYear().getValue()).toBe(2022);
    });

    it('atualiza marca, modelo e ano de uma vez', async () => {
      const vehicle = makeVehicle();
      repository.findById.mockResolvedValue(vehicle);
      repository.update.mockImplementation((v: Vehicle) => v);

      const updated = await service.update(vehicle.getId(), {
        brand: 'Volkswagen',
        model: 'Polo',
        year: 2023,
      });

      expect(updated.getBrand()).toBe('Volkswagen');
      expect(updated.getModel()).toBe('Polo');
      expect(updated.getYear().getValue()).toBe(2023);
    });

    it('atualiza o ano, inclusive quando o valor é o limite inferior', async () => {
      const vehicle = makeVehicle();
      repository.findById.mockResolvedValue(vehicle);
      repository.update.mockImplementation((v: Vehicle) => v);

      const updated = await service.update(vehicle.getId(), { year: 1900 });

      expect(updated.getYear().getValue()).toBe(1900);
    });

    it('lança VEHICLE_NOT_FOUND quando o veículo não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('inexistente', { brand: 'X' }),
      ).rejects.toThrow(VehicleApplicationError);
    });

    it('propaga erro de domínio em ano inválido', async () => {
      repository.findById.mockResolvedValue(makeVehicle());

      await expect(service.update('id', { year: 1800 })).rejects.toThrow(
        DomainException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('remove um veículo existente', async () => {
      const vehicle = makeVehicle();
      repository.findById.mockResolvedValue(vehicle);

      await service.delete(vehicle.getId());

      expect(repository.delete).toHaveBeenCalledWith(vehicle.getId());
    });

    it('lança VEHICLE_NOT_FOUND e não remove quando não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.delete('inexistente')).rejects.toThrow(
        VehicleApplicationError,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});
