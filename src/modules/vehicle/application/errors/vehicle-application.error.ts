import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';

export type VehicleErrorCode =
  'VEHICLE_NOT_FOUND' | 'VEHICLE_ALREADY_EXISTS' | 'CLIENT_NOT_FOUND';

const catalog: Record<
  VehicleErrorCode,
  { kind: ApplicationErrorKind; message: string }
> = {
  VEHICLE_NOT_FOUND: { kind: 'NOT_FOUND', message: 'Vehicle not found' },
  VEHICLE_ALREADY_EXISTS: {
    kind: 'CONFLICT',
    message: 'Vehicle already exists',
  },
  CLIENT_NOT_FOUND: { kind: 'NOT_FOUND', message: 'Client not found' },
};

export class VehicleApplicationError extends ApplicationError {
  declare readonly code: VehicleErrorCode;

  constructor(code: VehicleErrorCode) {
    super(code, catalog[code].kind, catalog[code].message);
  }
}
