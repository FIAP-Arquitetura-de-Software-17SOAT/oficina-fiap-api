export type ClientErrorCode =
  | 'CLIENT_NOT_FOUND'
  | 'CLIENT_ALREADY_EXISTS'
  | 'CLIENT_EMAIL_IN_USE'
  | 'CLIENT_HAS_VEHICLES'
  | 'CLIENT_ACCOUNT_EXISTS'
  | 'CLIENT_ACCOUNT_EMAIL_IN_USE';

const messages: Record<ClientErrorCode, string> = {
  CLIENT_NOT_FOUND: 'Client not found',
  CLIENT_ALREADY_EXISTS: 'Client already exists',
  CLIENT_EMAIL_IN_USE: 'E-mail already in use',
  CLIENT_HAS_VEHICLES: 'Client has vehicles and cannot be removed',
  CLIENT_ACCOUNT_EXISTS: 'Client already has an account',
  CLIENT_ACCOUNT_EMAIL_IN_USE: 'E-mail already used by another account',
};

export class ClientApplicationError extends Error {
  constructor(readonly code: ClientErrorCode) {
    super(messages[code]);
    this.name = 'ClientApplicationError';
  }
}
