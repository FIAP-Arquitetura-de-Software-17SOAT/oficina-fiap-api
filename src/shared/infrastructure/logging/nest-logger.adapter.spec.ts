import { Logger } from '@nestjs/common';
import { LoggerPort } from '../../application/logger.port';
import { NestLoggerAdapter } from './nest-logger.adapter';

describe('NestLoggerAdapter', () => {
  it('forwards structured errors to the Nest logger under the given context', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const adapter = new NestLoggerAdapter('SampleContext');

    adapter.error({ err: new Error('boom') }, 'Something failed');

    expect(adapter).toBeInstanceOf(LoggerPort);
    expect(error).toHaveBeenCalledWith(
      { err: expect.any(Error) as Error },
      'Something failed',
    );
    error.mockRestore();
  });
});
