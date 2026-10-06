import { ArgumentsHost } from '@nestjs/common';
import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../application/application.error';
import {
  ApplicationExceptionFilter,
  statusFor,
} from './application-exception.filter';

class SampleError extends ApplicationError {
  constructor(kind: ApplicationErrorKind) {
    super('SAMPLE', kind, 'sample message');
  }
}

describe('ApplicationExceptionFilter', () => {
  it.each<[ApplicationErrorKind, number, string]>([
    ['NOT_FOUND', 404, 'Not Found'],
    ['CONFLICT', 409, 'Conflict'],
    ['GONE', 410, 'Gone'],
    ['INVALID', 400, 'Bad Request'],
    ['UNAUTHORIZED', 401, 'Unauthorized'],
    ['FORBIDDEN', 403, 'Forbidden'],
  ])('maps %s to %i with the Nest envelope', (kind, statusCode, error) => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;

    new ApplicationExceptionFilter().catch(new SampleError(kind), host);

    expect(statusFor(kind)).toBe(statusCode);
    expect(response.status).toHaveBeenCalledWith(statusCode);
    expect(response.json).toHaveBeenCalledWith({
      statusCode,
      message: 'sample message',
      error,
    });
  });
});
