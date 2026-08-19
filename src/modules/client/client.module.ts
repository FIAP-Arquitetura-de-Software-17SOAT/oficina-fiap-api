import { Module } from '@nestjs/common';
import { ClientController } from './controllers/client.controller';
import { ClientRepository } from './repositories/client.repository';
import { ClientService } from './services/client.service';

@Module({
  controllers: [ClientController],
  providers: [ClientService, ClientRepository],
  exports: [ClientService, ClientRepository],
})
export class ClientModule {}
