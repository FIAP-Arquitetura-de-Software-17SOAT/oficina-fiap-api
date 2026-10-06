# Modulo Vehicle

Segundo modulo migrado. E o primeiro que **depende de outro modulo** (o dono do veiculo precisa existir em `client`), entao e aqui que aparece o padrao de porta + adapter entre modulos. A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md).

## Estrutura

```text
src/modules/vehicle/
  domain/
    entities/vehicle.entity.ts
    value-objects/plate.vo.ts
    value-objects/model-year.vo.ts
  application/
    use-cases/create-vehicle.use-case.ts
    use-cases/find-vehicle.use-case.ts
    use-cases/list-vehicles.use-case.ts
    use-cases/update-vehicle.use-case.ts
    use-cases/delete-vehicle.use-case.ts
    ports/vehicle-repository.port.ts
    ports/client-lookup.port.ts
    contracts/vehicle.input.ts
    errors/vehicle-application.error.ts
  infrastructure/
    persistence/prisma-vehicle.repository.ts
    persistence/vehicle-persistence.mapper.ts
    integrations/client-lookup.adapter.ts
  presentation/http/
    vehicle.controller.ts
    dto/vehicle.dto.ts
    mappers/vehicle-response.mapper.ts
  vehicle.module.ts
```

## O que mudou em relacao ao layout legado

| Antes | Depois |
| --- | --- |
| `entities/`, `value-objects/` | `domain/entities/`, `domain/value-objects/`, movidos sem alteracao |
| `services/vehicle.service.ts`: `@Injectable`, recebia `CreateVehicleDto`, lancava `NotFoundException` e `ConflictException`, injetava `FindClientUseCase` do client diretamente | `application/use-cases/`: cinco classes puras com `execute()`, inputs de `application/contracts/`, erros `VehicleApplicationError` |
| Dependencia direta no modulo `client` dentro do service | `application/ports/client-lookup.port.ts` (`exists(clientId)`) e `infrastructure/integrations/client-lookup.adapter.ts`, o unico arquivo do modulo que importa `client` |
| `repositories/vehicle.repository.ts`: classe concreta, traduzia `P2002` em `ConflictException` | `application/ports/vehicle-repository.port.ts` e `infrastructure/persistence/prisma-vehicle.repository.ts`, que traduz `P2002` em `VEHICLE_ALREADY_EXISTS` |
| `toDomain` privado dentro do repositorio | `infrastructure/persistence/vehicle-persistence.mapper.ts` |
| `mappers/vehicle.mapper.ts` | `presentation/http/mappers/vehicle-response.mapper.ts` |
| `VehicleController` em `providers`/`exports`, chamado pelo `ServiceOrderService` | Modulo exporta so `FindVehicleUseCase`; `service-order` injeta o caso de uso e le `vehicle.getClientId()` |

Contratos HTTP, mensagens publicas (`Vehicle not found`, `Vehicle already exists`, `Client not found`), schema e migrations nao mudaram.

## Porta e adapter entre modulos

O caso de uso so precisa saber se o cliente existe. A porta expoe exatamente isso, com um tipo primitivo, sem entidade nem erro do modulo `client`:

```typescript
// application/ports/client-lookup.port.ts
export abstract class ClientLookupPort {
  abstract exists(clientId: string): Promise<boolean>;
}
```

O adapter e quem conhece o fornecedor. Ele traduz o resultado esperado (`CLIENT_NOT_FOUND`) para o contrato da porta e deixa qualquer outro erro subir:

```typescript
// infrastructure/integrations/client-lookup.adapter.ts
async exists(clientId: string): Promise<boolean> {
  try {
    await this.findClient.execute(clientId);
    return true;
  } catch (error) {
    if (error instanceof ClientApplicationError && error.code === 'CLIENT_NOT_FOUND') {
      return false;
    }
    throw error;
  }
}
```

Se o modulo `client` mudar a forma de buscar cliente, so o adapter muda. O caso de uso e o teste dele nao sabem.

## Erros

| Codigo | `kind` | Status | Mensagem |
| --- | --- | --- | --- |
| `VEHICLE_NOT_FOUND` | `NOT_FOUND` | 404 | `Vehicle not found` |
| `VEHICLE_ALREADY_EXISTS` | `CONFLICT` | 409 | `Vehicle already exists` |
| `CLIENT_NOT_FOUND` | `NOT_FOUND` | 404 | `Client not found` |

## Quem consome o modulo

`service-order` injeta `FindVehicleUseCase` para conferir que o veiculo existe e pertence ao cliente da OS. Nos testes E2E, o Prisma e substituido com `overrideProvider(VehicleRepositoryPort).useValue(new InMemoryVehicleRepository())`.

## Testes

- Casos de uso: `application/use-cases/vehicle-use-cases.spec.ts`, com repositorio e porta de cliente mockados, sem Nest.
- Adapter: `infrastructure/integrations/client-lookup.adapter.spec.ts` cobre os tres caminhos (existe, nao existe, falha inesperada).
- Fronteira de imports: `vehicle` listado em `test/architecture/migrated-modules.ts`.
- HTTP: `test/vehicle.e2e-spec.ts` e `test/service-order.e2e-spec.ts` inalterados no contrato.
