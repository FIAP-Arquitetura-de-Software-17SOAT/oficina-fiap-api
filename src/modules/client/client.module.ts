import { Module } from '@nestjs/common';
import { ClientController } from './controllers/client.controller';
import { PrismaService } from './prisma.service';
import { ClientRepository } from './repositories/client.repository';
import { ClientService } from './services/client.service';

@Module({
  controllers: [ClientController],

  providers: [ClientService, ClientRepository, PrismaService],

  exports: [ClientService],
})
export class ClientModule {}
