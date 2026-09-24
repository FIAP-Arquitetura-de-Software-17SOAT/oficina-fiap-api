import { Module } from '@nestjs/common';
import { IdentityModule } from '../../shared/identity/identity.module';
import { ClientController } from './controllers/client.controller';
import { ClientRepository } from './repositories/client.repository';
import { ClientAccountService } from './services/client-account.service';
import { ClientService } from './services/client.service';

@Module({
  imports: [IdentityModule],
  controllers: [ClientController],
  providers: [ClientService, ClientAccountService, ClientRepository],
  exports: [ClientService, ClientRepository],
})
export class ClientModule {}
