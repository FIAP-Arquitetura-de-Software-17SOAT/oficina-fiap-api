import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';

export type ServiceCatalogErrorCode =
  | 'SERVICE_NOT_FOUND'
  | 'SERVICE_NAME_IN_USE'
  | 'SERVICE_ALREADY_EXISTS'
  | 'SERVICE_IN_USE';

const catalog: Record<
  ServiceCatalogErrorCode,
  { kind: ApplicationErrorKind; message: string }
> = {
  SERVICE_NOT_FOUND: { kind: 'NOT_FOUND', message: 'Serviço não encontrado' },
  // Pré-checagem do caso de uso, com a mensagem de negócio.
  SERVICE_NAME_IN_USE: {
    kind: 'CONFLICT',
    message: 'Já existe um serviço com esse nome',
  },
  // Corrida perdida no banco (P2002), com a mensagem que a API já expunha.
  SERVICE_ALREADY_EXISTS: {
    kind: 'CONFLICT',
    message: 'Service already exists',
  },
  // Serviço já usado em ordens de serviço (P2003 no delete).
  SERVICE_IN_USE: {
    kind: 'CONFLICT',
    message: 'Service is in use by service orders and cannot be removed',
  },
};

export class ServiceCatalogApplicationError extends ApplicationError {
  declare readonly code: ServiceCatalogErrorCode;

  constructor(code: ServiceCatalogErrorCode) {
    super(code, catalog[code].kind, catalog[code].message);
  }
}
