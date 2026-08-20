import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainException } from '../../../shared/domain/domain.exception';
import { ClientService } from '../../client/services/client.service';
import { Vehicle } from '../entities/vehicle.entity';
import { VehicleRepository } from '../repositories/vehicle.repository';
import { VehicleService } from './vehicle.service';

const CLIENT_ID = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const makeVehicle = (plate = 'ABC1D23') =>
  Vehicle.create({
    clientId: CLIENT_ID,
    plate,
    brand: 'Fiat',
    model: 'Argo',
    year: 2022,
  });

describe('VehicleService', () => {
  let service: VehicleService;
  let repository: { [K in keyof VehicleRepository]: jest.Mock };
  let clientService: { findById: jest.Mock };

  const dto = {
    clientId: CLIENT_ID,
    plate: 'abc-1d23',
    brand: 'Fiat',
    model: 'Argo',
    year: 2022,
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByPlate: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    clientService = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleService,
        { provide: VehicleRepository, useValue: repository },
        { provide: ClientService, useValue: clientService },
      ],
    }).compile();

    service = module.get<VehicleService>(VehicleService);
  });

  describe('create', () => {
    it('persiste o veículo quando cliente existe e placa está livre', async () => {
      clientService.findById.mockResolvedValue({});
      repository.findByPlate.mockResolvedValue(null);
      repository.create.mockImplementation((v: Vehicle) => v);

      const created = await service.create(dto);

      expect(created.getPlate().getValue()).toBe('ABC1D23');
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('consulta a placa já normalizada, sem máscara', async () => {
      clientService.findById.mockResolvedValue({});
      repository.findByPlate.mockResolvedValue(null);
      repository.create.mockImplementation((v: Vehicle) => v);

      await service.create(dto);

      expect(repository.findByPlate).toHaveBeenCalledWith('ABC1D23');
    });

    it('recusa quando o cliente não existe, sem gravar veículo órfão', async () => {
      clientService.findById.mockRejectedValue(
        new NotFoundException('Client not found'),
      );

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('recusa placa já cadastrada', async () => {
      clientService.findById.mockResolvedValue({});
      repository.findByPlate.mockResolvedValue(makeVehicle());

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('recusa placa inválida antes de tocar no banco', async () => {
      await expect(
        service.create({ ...dto, plate: 'ABCD123' }),
      ).rejects.toThrow(DomainException);

      expect(clientService.findById).not.toHaveBeenCalled();
      expect(repository.findByPlate).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('retorna o veículo encontrado', async () => {
      const vehicle = makeVehicle();
      repository.findById.mockResolvedValue(vehicle);

      await expect(service.findById(vehicle.getId())).resolves.toBe(vehicle);
    });

    it('lança NotFound quando não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('lista todos quando não há filtro', async () => {
      const vehicles = [makeVehicle()];
      repository.findAll.mockResolvedValue(vehicles);

      await expect(service.findAll()).resolves.toBe(vehicles);
      expect(clientService.findById).not.toHaveBeenCalled();
      expect(repository.findAll).toHaveBeenCalledWith(undefined);
    });

    it('filtra por cliente e valida que ele existe', async () => {
      clientService.findById.mockResolvedValue({});
      repository.findAll.mockResolvedValue([]);

      await service.findAll(CLIENT_ID);

      expect(clientService.findById).toHaveBeenCalledWith(CLIENT_ID);
      expect(repository.findAll).toHaveBeenCalledWith(CLIENT_ID);
    });

    it('lança NotFound ao filtrar por cliente inexistente', async () => {
      clientService.findById.mockRejectedValue(
        new NotFoundException('Client not found'),
      );

      await expect(service.findAll(CLIENT_ID)).rejects.toThrow(
        NotFoundException,
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

    it('lança NotFound quando o veículo não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('inexistente', { brand: 'X' }),
      ).rejects.toThrow(NotFoundException);
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

    it('lança NotFound e não remove quando não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.delete('inexistente')).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});
