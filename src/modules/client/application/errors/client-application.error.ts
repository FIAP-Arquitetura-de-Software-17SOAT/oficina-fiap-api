import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';

export type ClientErrorCode =
  | 'CLIENT_NOT_FOUND'
  | 'CLIENT_ALREADY_EXISTS'
  | 'CLIENT_EMAIL_IN_USE'
  | 'CLIENT_HAS_VEHICLES'
  | 'CLIENT_ACCOUNT_EXISTS'
  | 'CLIENT_ACCOUNT_EMAIL_IN_USE';

const catalog: Record<
  ClientErrorCode,
  { kind: ApplicationErrorKind; message: string }
> = {
  CLIENT_NOT_FOUND: { kind: 'NOT_FOUND', message: 'Client not found' },
  CLIENT_ALREADY_EXISTS: { kind: 'CONFLICT', message: 'Client already exists' },
  CLIENT_EMAIL_IN_USE: { kind: 'CONFLICT', message: 'E-mail already in use' },
  CLIENT_HAS_VEHICLES: {
    kind: 'CONFLICT',
    message: 'Client has vehicles and cannot be removed',
  },
  CLIENT_ACCOUNT_EXISTS: {
    kind: 'CONFLICT',
    message: 'Client already has an account',
  },
  CLIENT_ACCOUNT_EMAIL_IN_USE: {
    kind: 'CONFLICT',
    message: 'E-mail already used by another account',
  },
};

export class ClientApplicationError extends ApplicationError {
  declare readonly code: ClientErrorCode;

  constructor(code: ClientErrorCode) {
    super(code, catalog[code].kind, catalog[code].message);
  }
}
