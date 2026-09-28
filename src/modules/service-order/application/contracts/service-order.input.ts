export interface RequestedServiceInput {
  serviceId: string;
  quantity?: number;
}

export interface RequestedPartInput {
  partId: string;
  quantity: number;
}

export interface OpenServiceOrderInput {
  clientId: string;
  vehicleId: string;
  description: string;
  services?: RequestedServiceInput[];
  parts?: RequestedPartInput[];
}

export interface AssignMechanicInput {
  mechanicId: string;
}

export interface CancelServiceOrderInput {
  reason: string;
}

export interface AverageExecutionTime {
  averageExecutionTimeMs: number | null;
  sampleSize: number;
}
