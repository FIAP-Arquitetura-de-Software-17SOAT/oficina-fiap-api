import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../application/application.error';

const statusByKind: Record<ApplicationErrorKind, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  GONE: HttpStatus.GONE,
  INVALID: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
};

const reasonByStatus: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.GONE]: 'Gone',
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
};

export function statusFor(kind: ApplicationErrorKind): HttpStatus {
  return statusByKind[kind];
}

/**
 * Único ponto onde um erro de aplicação vira status HTTP. Os casos de uso
 * dizem o que aconteceu (`kind`); o envelope é o mesmo das exceções do Nest.
 */
@Catch(ApplicationError)
export class ApplicationExceptionFilter implements ExceptionFilter<ApplicationError> {
  catch(exception: ApplicationError, host: ArgumentsHost): void {
    const statusCode = statusFor(exception.kind);
    host.switchToHttp().getResponse<Response>().status(statusCode).json({
      statusCode,
      message: exception.message,
      error: reasonByStatus[statusCode],
    });
  }
}
