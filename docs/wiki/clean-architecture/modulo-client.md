# Modulo Client

Primeiro modulo migrado para Clean Architecture e referencia para os demais. A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md); esta pagina mostra como ela se aplica ao `client`.

## Estrutura

```text
src/modules/client/
  domain/
    entities/client.entity.ts
    value-objects/document.vo.ts
    value-objects/email.vo.ts
  application/
    use-cases/create-client.use-case.ts
    use-cases/find-client.use-case.ts
    use-cases/list-clients.use-case.ts
    use-cases/update-client.use-case.ts
    use-cases/delete-client.use-case.ts
    use-cases/create-client-account.use-case.ts
    ports/client-repository.port.ts
    ports/client-identity.port.ts
    contracts/client.input.ts
    contracts/client-account.result.ts
    errors/client-application.error.ts
  infrastructure/
    persistence/prisma-client.repository.ts
    persistence/client-persistence.mapper.ts
    identity/client-identity.adapter.ts
  presentation/http/
    client.controller.ts
    client-application-exception.filter.ts
    dto/client.dto.ts
    dto/client-account.dto.ts
    mappers/client-response.mapper.ts
  client-architecture.spec.ts
  client.module.ts
```

## O que mudou em relacao ao layout legado

| Antes                                                                                                              | Depois                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `entities/`, `value-objects/`                                                                                      | `domain/entities/`, `domain/value-objects/` — movidos sem alteracao                                                                       |
| `services/client.service.ts`: uma classe `@Injectable` com cinco metodos, recebia `CreateClientDto`, lancava `NotFoundException` e `ConflictException` | `application/use-cases/`: seis classes puras com `execute()`, recebem inputs de `application/contracts/`, lancam `ClientApplicationError` |
| `services/client-account.service.ts` usava `UserRepository` e `PasswordHashService` diretamente                   | `CreateClientAccountUseCase` depende de `ClientIdentityPort`; `infrastructure/identity/client-identity.adapter.ts` fala com `shared/identity` |
| `repositories/client.repository.ts`: classe concreta injetada no service, traduzia `P2002` em `ConflictException` | `application/ports/client-repository.port.ts` e o contrato; `infrastructure/persistence/prisma-client.repository.ts` implementa e traduz `P2002`/FK em `ClientApplicationError` |
| `mappers/client.mapper.ts` misturava persistencia e resposta HTTP                                                  | `infrastructure/persistence/client-persistence.mapper.ts` e `presentation/http/mappers/client-response.mapper.ts`                          |
| `controllers/client.controller.ts` injetava dois services                                                          | `presentation/http/client.controller.ts` injeta os seis casos de uso                                                                      |
| Status HTTP decidido no service e no repository                                                                    | `presentation/http/client-application-exception.filter.ts`: `CLIENT_NOT_FOUND` vira 404, os demais codigos viram 409, mesmo envelope de antes |
| —                                                                                                                  | `client-architecture.spec.ts` + `test/client-architecture-check.ts`: teste de fronteira de imports                                        |

Contratos HTTP, mensagens publicas, schema e migrations nao mudaram.

## Como as pecas se ligam

A porta e uma classe abstrata: serve de contrato e de token de injecao ao mesmo tempo.

```typescript
// application/ports/client-repository.port.ts
export abstract class ClientRepositoryPort {
  abstract create(client: Client): Promise<Client>;
  abstract findById(id: string): Promise<Client | null>;
  // ...
}
```

O caso de uso depende so da porta e nao tem decorator:

```typescript
// application/use-cases/find-client.use-case.ts
export class FindClientUseCase {
  constructor(private readonly clients: ClientRepositoryPort) {}

  async execute(id: string): Promise<Client> {
    const client = await this.clients.findById(id);
    if (!client) throw new ClientApplicationError('CLIENT_NOT_FOUND');
    return client;
  }
}
```

O modulo Nest escolhe a implementacao e instancia os casos de uso por factory:

```typescript
// client.module.ts
providers: [
  { provide: ClientRepositoryPort, useClass: PrismaClientRepository },
  { provide: ClientIdentityPort, useClass: ClientIdentityAdapter },
  {
    provide: FindClientUseCase,
    useFactory: (clients: ClientRepositoryPort) => new FindClientUseCase(clients),
    inject: [ClientRepositoryPort],
  },
  // ...
],
exports: [FindClientUseCase, ClientRepositoryPort],
```

## Quem consome o modulo

`vehicle`, `service-order`, `budget` e `billing` injetam `FindClientUseCase` ou `ClientRepositoryPort`. Nos testes E2E, o Prisma e substituido com `overrideProvider(ClientRepositoryPort).useValue(new InMemoryClientRepository())`.

## Testes

- Casos de uso: `application/use-cases/*.spec.ts`, instanciados com `InMemoryClientRepository` e fakes da porta de identidade, sem Nest.
- Fronteira de imports: `client-architecture.spec.ts`, roda com `npm test`. Cobre `import type`, reexport, `require`, `import()` e aliases do `tsconfig`.
- HTTP: `test/client.e2e-spec.ts` e `test/customer.e2e-spec.ts` continuam validando contrato, Swagger e autenticacao.
