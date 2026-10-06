import { Logger } from '@nestjs/common';
import { LoggerPort } from '../../application/logger.port';

/** Implementa `LoggerPort` com o Logger do Nest (que o nestjs-pino intercepta). */
export class NestLoggerAdapter extends LoggerPort {
  private readonly logger: Logger;

  constructor(context: string) {
    super();
    this.logger = new Logger(context);
  }

  error(details: Record<string, unknown>, message: string): void {
    this.logger.error(details, message);
  }
}
