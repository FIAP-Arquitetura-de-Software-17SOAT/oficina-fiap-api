import { ClientApplicationError } from '../../../client/application/errors/client-application.error';
import { FindClientUseCase } from '../../../client/application/use-cases/find-client.use-case';
import { ServiceCatalogApplicationError } from '../../../service-catalog/application/errors/service-catalog-application.error';
import { FindServiceUseCase } from '../../../service-catalog/application/use-cases/find-service.use-case';
import { StockApplicationError } from '../../../stock/application/errors/stock-application.error';
import { FindPartUseCase } from '../../../stock/application/use-cases/find-part.use-case';
import { VehicleApplicationError } from '../../../vehicle/application/errors/vehicle-application.error';
import { FindVehicleUseCase } from '../../../vehicle/application/use-cases/find-vehicle.use-case';
import { ClientLookupAdapter } from './client-lookup.adapter';
import { PartCatalogAdapter } from './part-catalog.adapter';
import { ServiceCatalogAdapter } from './service-catalog.adapter';
import { VehicleLookupAdapter } from './vehicle-lookup.adapter';

describe('service-order lookup adapters', () => {
  describe.each([
    [
      'ClientLookupAdapter',
      (execute: jest.Mock) =>
        new ClientLookupAdapter({ execute } as unknown as FindClientUseCase),
      new ClientApplicationError('CLIENT_NOT_FOUND'),
    ],
    [
      'ServiceCatalogAdapter',
      (execute: jest.Mock) =>
        new ServiceCatalogAdapter({
          execute,
        } as unknown as FindServiceUseCase),
      new ServiceCatalogApplicationError('SERVICE_NOT_FOUND'),
    ],
    [
      'PartCatalogAdapter',
      (execute: jest.Mock) =>
        new PartCatalogAdapter({ execute } as unknown as FindPartUseCase),
      new StockApplicationError('PART_NOT_FOUND'),
    ],
  ] as const)('%s', (_name, build, notFound) => {
    it('answers true when the supplier finds the record', async () => {
      const execute = jest.fn().mockResolvedValue({});
      await expect(build(execute).exists('id')).resolves.toBe(true);
      expect(execute).toHaveBeenCalledWith('id');
    });

    it('translates the supplier not-found into false', async () => {
      const execute = jest.fn().mockRejectedValue(notFound);
      await expect(build(execute).exists('missing')).resolves.toBe(false);
    });

    it('propagates any other failure', async () => {
      const execute = jest.fn().mockRejectedValue(new Error('database down'));
      await expect(build(execute).exists('id')).rejects.toThrow(
        'database down',
      );
    });
  });

  describe('VehicleLookupAdapter', () => {
    const findVehicle = { execute: jest.fn() };
    const adapter = new VehicleLookupAdapter(
      findVehicle as unknown as FindVehicleUseCase,
    );

    it('projects the vehicle onto id and owner', async () => {
      findVehicle.execute.mockResolvedValue({
        getId: () => 'v-1',
        getClientId: () => 'c-1',
      });
      await expect(adapter.findById('v-1')).resolves.toEqual({
        id: 'v-1',
        clientId: 'c-1',
      });
    });

    it('turns VEHICLE_NOT_FOUND into null', async () => {
      findVehicle.execute.mockRejectedValue(
        new VehicleApplicationError('VEHICLE_NOT_FOUND'),
      );
      await expect(adapter.findById('missing')).resolves.toBeNull();
    });

    it('propagates any other failure', async () => {
      findVehicle.execute.mockRejectedValue(new Error('database down'));
      await expect(adapter.findById('v-1')).rejects.toThrow('database down');
    });
  });
});
