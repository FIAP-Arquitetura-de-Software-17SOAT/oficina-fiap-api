/** O que a OS precisa do veículo: existir e ter um dono para conferir. */
export interface VehicleSummary {
  id: string;
  clientId: string;
}

export abstract class VehicleLookupPort {
  abstract findById(vehicleId: string): Promise<VehicleSummary | null>;
}
