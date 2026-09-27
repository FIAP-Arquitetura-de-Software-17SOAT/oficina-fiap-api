export interface CreateVehicleInput {
  clientId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
}

export interface UpdateVehicleInput {
  brand?: string;
  model?: string;
  year?: number;
}
