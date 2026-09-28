import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { OpenServiceOrderInput } from '../contracts/service-order.input';
import { ServiceOrderApplicationError } from '../errors/service-order-application.error';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { PartCatalogPort } from '../ports/part-catalog.port';
import { ServiceCatalogPort } from '../ports/service-catalog.port';
import { ServiceOrderRepositoryPort } from '../ports/service-order-repository.port';
import { VehicleLookupPort } from '../ports/vehicle-lookup.port';

export class OpenServiceOrderUseCase {
  constructor(
    private readonly serviceOrders: ServiceOrderRepositoryPort,
    private readonly clients: ClientLookupPort,
    private readonly vehicles: VehicleLookupPort,
    private readonly services: ServiceCatalogPort,
    private readonly parts: PartCatalogPort,
  ) {}

  async execute(input: OpenServiceOrderInput): Promise<ServiceOrder> {
    if (!(await this.clients.exists(input.clientId))) {
      throw new ServiceOrderApplicationError('CLIENT_NOT_FOUND');
    }

    // O veículo precisa existir e ser do cliente da OS. Sem isso dá para abrir
    // ordem de serviço do cliente A com o carro do cliente B.
    const vehicle = await this.vehicles.findById(input.vehicleId);
    if (!vehicle) {
      throw new ServiceOrderApplicationError('VEHICLE_NOT_FOUND');
    }
    if (vehicle.clientId !== input.clientId) {
      throw new ServiceOrderApplicationError('VEHICLE_NOT_OWNED_BY_CLIENT');
    }

    // Serviços e peças são opcionais, mas o que vier precisa existir: sem a
    // conferência o id inválido só esbarraria na chave estrangeira, em 500.
    for (const { serviceId } of input.services ?? []) {
      if (!(await this.services.exists(serviceId))) {
        throw new ServiceOrderApplicationError('SERVICE_NOT_FOUND');
      }
    }
    for (const { partId } of input.parts ?? []) {
      if (!(await this.parts.exists(partId))) {
        throw new ServiceOrderApplicationError('PART_NOT_FOUND');
      }
    }

    return this.serviceOrders.create(
      ServiceOrder.create({
        clientId: input.clientId,
        vehicleId: input.vehicleId,
        description: input.description,
        requestedServices: (input.services ?? []).map((service) => ({
          serviceId: service.serviceId,
          quantity: service.quantity ?? 1,
        })),
        requestedParts: input.parts ?? [],
      }),
    );
  }
}
