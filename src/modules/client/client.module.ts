import { Module } from '@nestjs/common';
import { IdentityModule } from '../../shared/identity/identity.module';
import { ClientController } from './presentation/http/client.controller';
import { ClientRepositoryPort } from './application/ports/client-repository.port';
import { ClientIdentityPort } from './application/ports/client-identity.port';
import { CreateClientUseCase } from './application/use-cases/create-client.use-case';
import { FindClientUseCase } from './application/use-cases/find-client.use-case';
import { ListClientsUseCase } from './application/use-cases/list-clients.use-case';
import { UpdateClientUseCase } from './application/use-cases/update-client.use-case';
import { DeleteClientUseCase } from './application/use-cases/delete-client.use-case';
import { CreateClientAccountUseCase } from './application/use-cases/create-client-account.use-case';
import { PrismaClientRepository } from './infrastructure/persistence/prisma-client.repository';
import { ClientIdentityAdapter } from './infrastructure/identity/client-identity.adapter';

@Module({
  imports: [IdentityModule],
  controllers: [ClientController],
  providers: [
    { provide: ClientRepositoryPort, useClass: PrismaClientRepository },
    { provide: ClientIdentityPort, useClass: ClientIdentityAdapter },
    ...[
      CreateClientUseCase,
      FindClientUseCase,
      ListClientsUseCase,
      UpdateClientUseCase,
      DeleteClientUseCase,
    ].map((useCase) => ({
      provide: useCase,
      useFactory: (clients: ClientRepositoryPort) => new useCase(clients),
      inject: [ClientRepositoryPort],
    })),
    {
      provide: CreateClientAccountUseCase,
      useFactory: (
        clients: ClientRepositoryPort,
        identity: ClientIdentityPort,
      ) => new CreateClientAccountUseCase(clients, identity),
      inject: [ClientRepositoryPort, ClientIdentityPort],
    },
  ],
  exports: [FindClientUseCase],
})
export class ClientModule {}
