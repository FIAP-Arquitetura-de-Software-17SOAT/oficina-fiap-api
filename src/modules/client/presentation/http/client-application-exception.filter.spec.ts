import { ArgumentsHost } from '@nestjs/common';
import {
  ClientApplicationError,
  ClientErrorCode,
} from '../../application/errors/client-application.error';
import { ClientApplicationExceptionFilter } from './client-application-exception.filter';

describe('ClientApplicationExceptionFilter', () => {
  it.each<[ClientErrorCode, number, string]>([
    ['CLIENT_NOT_FOUND', 404, 'Not Found'],
    ['CLIENT_ALREADY_EXISTS', 409, 'Conflict'],
    ['CLIENT_EMAIL_IN_USE', 409, 'Conflict'],
    ['CLIENT_HAS_VEHICLES', 409, 'Conflict'],
    ['CLIENT_ACCOUNT_EXISTS', 409, 'Conflict'],
    ['CLIENT_ACCOUNT_EMAIL_IN_USE', 409, 'Conflict'],
  ])('preserves the HTTP contract for %s', (code, statusCode, error) => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    const exception = new ClientApplicationError(code);
    new ClientApplicationExceptionFilter().catch(exception, host);
    expect(response.status).toHaveBeenCalledWith(statusCode);
    expect(response.json).toHaveBeenCalledWith({
      statusCode,
      message: exception.message,
      error,
    });
  });
});
