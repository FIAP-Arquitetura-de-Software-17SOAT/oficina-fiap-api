import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';

export type ServiceOrderErrorCode =
  | 'SERVICE_ORDER_NOT_FOUND'
  | 'CLIENT_NOT_FOUND'
  | 'VEHICLE_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
  | 'PART_NOT_FOUND'
  | 'VEHICLE_NOT_OWNED_BY_CLIENT'
  | 'MECHANIC_BUSY';

export interface ServiceOrderErrorParams {
  activeServiceOrderId?: string;
}

const catalog: Record<
  ServiceOrderErrorCode,
  {
    kind: ApplicationErrorKind;
    message: (p: ServiceOrderErrorParams) => string;
  }
> = {
  SERVICE_ORDER_NOT_FOUND: {
    kind: 'NOT_FOUND',
    message: () => 'Service order not found',
  },
  CLIENT_NOT_FOUND: { kind: 'NOT_FOUND', message: () => 'Client not found' },
  VEHICLE_NOT_FOUND: { kind: 'NOT_FOUND', message: () => 'Vehicle not found' },
  SERVICE_NOT_FOUND: {
    kind: 'NOT_FOUND',
    message: () => 'Serviço não encontrado',
  },
  PART_NOT_FOUND: { kind: 'NOT_FOUND', message: () => 'Peça não encontrada' },
  VEHICLE_NOT_OWNED_BY_CLIENT: {
    kind: 'INVALID',
    message: () => 'Vehicle does not belong to the informed client',
  },
  MECHANIC_BUSY: {
    kind: 'CONFLICT',
    message: (p) =>
      `Mechanic already has an open service order (${p.activeServiceOrderId ?? ''})`,
  },
};

export class ServiceOrderApplicationError extends ApplicationError {
  declare readonly code: ServiceOrderErrorCode;

  constructor(
    code: ServiceOrderErrorCode,
    params: ServiceOrderErrorParams = {},
  ) {
    super(code, catalog[code].kind, catalog[code].message(params));
  }
}
