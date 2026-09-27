import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ClientApplicationError } from '../../application/errors/client-application.error';

@Catch(ClientApplicationError)
export class ClientApplicationExceptionFilter implements ExceptionFilter<ClientApplicationError> {
  catch(exception: ClientApplicationError, host: ArgumentsHost): void {
    const notFound = exception.code === 'CLIENT_NOT_FOUND';
    const statusCode = notFound ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({
        statusCode,
        message: exception.message,
        error: notFound ? 'Not Found' : 'Conflict',
      });
  }
}
