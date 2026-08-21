import { Test, TestingModule } from '@nestjs/testing';
import { Vehicle } from '../entities/vehicle.entity';
import { VehicleService } from '../services/vehicle.service';
import { VehicleController } from './vehicle.controller';

const CLIENT_ID = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const makeVehicle = (plate = 'ABC1D23') =>
  Vehicle.create({
    clientId: CLIENT_ID,
    plate,
    brand: 'Fiat',
    model: 'Argo',
    year: 2022,
  });

describe('VehicleController', () => {
  let controller: VehicleController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VehicleController],
      providers: [{ provide: VehicleService, useValue: service }],
    }).compile();

    controller = module.get<VehicleController>(VehicleController);
  });

  it('create devolve o DTO com os Value Objects desembrulhados', async () => {
    service.create.mockResolvedValue(makeVehicle());
    const dto = {
      clientId: CLIENT_ID,
      plate: 'ABC1D23',
      brand: 'Fiat',
      model: 'Argo',
      year: 2022,
    };

    const response = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(response.plate).toBe('ABC1D23');
    expect(response.year).toBe(2022);
  });

  it('findAll sem filtro repassa undefined', async () => {
    service.findAll.mockResolvedValue([]);

    await controller.findAll({});

    expect(service.findAll).toHaveBeenCalledWith(undefined);
  });

  it('findAll repassa o filtro de cliente', async () => {
    service.findAll.mockResolvedValue([
      makeVehicle('ABC1234'),
      makeVehicle('XYZ9876'),
    ]);

    const response = await controller.findAll({ clientId: CLIENT_ID });

    expect(service.findAll).toHaveBeenCalledWith(CLIENT_ID);
    expect(response.map((v) => v.plate)).toEqual(['ABC1234', 'XYZ9876']);
  });

  it('findById delega o id para o service', async () => {
    const vehicle = makeVehicle();
    service.findById.mockResolvedValue(vehicle);

    const response = await controller.findById(vehicle.getId());

    expect(service.findById).toHaveBeenCalledWith(vehicle.getId());
    expect(response.id).toBe(vehicle.getId());
  });

  it('update repassa id e dto', async () => {
    const vehicle = makeVehicle();
    service.update.mockResolvedValue(vehicle);

    await controller.update(vehicle.getId(), { brand: 'Volkswagen' });

    expect(service.update).toHaveBeenCalledWith(vehicle.getId(), {
      brand: 'Volkswagen',
    });
  });

  it('delete não devolve corpo', async () => {
    service.delete.mockResolvedValue(undefined);

    await expect(controller.delete('id')).resolves.toBeUndefined();
    expect(service.delete).toHaveBeenCalledWith('id');
  });
});
