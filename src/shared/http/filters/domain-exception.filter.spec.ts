import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { DomainException } from '../../domain/domain.exception';
import { DomainExceptionFilter } from './domain-exception.filter';

describe('DomainExceptionFilter', () => {
  it('responde 400 com a mensagem da regra de negócio', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    new DomainExceptionFilter().catch(
      new DomainException('CPF/CNPJ inválido'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'CPF/CNPJ inválido',
      error: 'Bad Request',
    });
  });
});
