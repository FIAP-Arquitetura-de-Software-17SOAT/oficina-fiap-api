import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';

export type NotificationErrorCode =
  | 'NOTIFICATION_NOT_FOUND'
  | 'NOTIFICATION_NOT_FAILED'
  | 'NOTIFICATION_CONCURRENT_UPDATE';

const catalog: Record<
  NotificationErrorCode,
  { kind: ApplicationErrorKind; message: string }
> = {
  NOTIFICATION_NOT_FOUND: {
    kind: 'NOT_FOUND',
    message: 'Notificação não encontrada',
  },
  NOTIFICATION_NOT_FAILED: {
    kind: 'CONFLICT',
    message: 'Somente notificação que falhou pode ser reenviada',
  },
  NOTIFICATION_CONCURRENT_UPDATE: {
    kind: 'CONFLICT',
    message: 'A notificação foi alterada por outro envio',
  },
};

export class NotificationApplicationError extends ApplicationError {
  declare readonly code: NotificationErrorCode;

  constructor(code: NotificationErrorCode) {
    super(code, catalog[code].kind, catalog[code].message);
  }
}
