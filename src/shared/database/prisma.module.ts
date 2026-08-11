import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global de propósito: cada módulo de domínio (cliente, veículo, ordem de
 * serviço, estoque...) compartilha a MESMA conexão. Um PrismaService por
 * módulo significaria um pool de conexões por módulo.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
