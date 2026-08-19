import { Vehicle } from '../entities/vehicle.entity';
import { VehicleMapper } from './vehicle.mapper';

const CLIENT_ID = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const makeVehicle = (plate = 'abc-1d23') =>
  Vehicle.create({
    clientId: CLIENT_ID,
    plate,
    brand: 'Fiat',
    model: 'Argo',
    year: 2022,
  });

describe('VehicleMapper', () => {
  it('desembrulha os Value Objects para primitivos', () => {
    expect(VehicleMapper.toResponse(makeVehicle())).toEqual({
      id: expect.any(String) as string,
      clientId: CLIENT_ID,
      plate: 'ABC1D23',
      brand: 'Fiat',
      model: 'Argo',
      year: 2022,
      createdAt: expect.any(Date) as Date,
      updatedAt: expect.any(Date) as Date,
    });
  });

  it('serializa plate como string e year como número', () => {
    const json = JSON.parse(
      JSON.stringify(VehicleMapper.toResponse(makeVehicle())),
    ) as Record<string, unknown>;

    expect(typeof json.plate).toBe('string');
    expect(typeof json.year).toBe('number');
  });

  it('mapeia listas preservando a ordem', () => {
    const responses = VehicleMapper.toResponseList([
      makeVehicle('ABC1234'),
      makeVehicle('XYZ9876'),
    ]);

    expect(responses.map((r) => r.plate)).toEqual(['ABC1234', 'XYZ9876']);
  });

  it('mapeia lista vazia', () => {
    expect(VehicleMapper.toResponseList([])).toEqual([]);
  });
});
