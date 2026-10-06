# Modulo Service Catalog

Terceiro modulo migrado. E uma folha: nao depende de nenhum outro modulo, e dois modulos legados (`service-order` e `budget`) dependem dele para conferir que um servico existe. A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md).

## Estrutura

```text
src/modules/service-catalog/
  domain/
    entities/service.entity.ts
  application/
    use-cases/create-service.use-case.ts
    use-cases/find-service.use-case.ts
    use-cases/list-services.use-case.ts
    use-cases/update-service.use-case.ts
    use-cases/delete-service.use-case.ts
    ports/service-repository.port.ts
    contracts/service.input.ts
    errors/service-catalog-application.error.ts
  infrastructure/
    persistence/prisma-service.repository.ts
    persistence/service-persistence.mapper.ts
  presentation/http/
    service.controller.ts
    dto/service.dto.ts
    mappers/service-response.mapper.ts
  service-catalog.module.ts
```

Nao ha `value-objects/` proprio: o preco usa o `Money` de `src/shared/domain`.

## O que mudou em relacao ao layout legado

| Antes | Depois |
| --- | --- |
| `entities/service.entity.ts` | `domain/entities/service.entity.ts`, movido sem alteracao |
| `services/service-catalog.service.ts`: `@Injectable`, recebia `CreateServiceDto`, lancava `NotFoundException` e `ConflictException` | `application/use-cases/`: cinco classes puras com `execute()`, inputs de `application/contracts/`, erros `ServiceCatalogApplicationError` |
| `repositories/service.repository.ts`: classe concreta, traduzia `P2002` em `ConflictException` no `create` e no `update` | `application/ports/service-repository.port.ts` e `infrastructure/persistence/prisma-service.repository.ts`, que traduz `P2002` em `SERVICE_ALREADY_EXISTS` |
| `toDomain`/`toPersistence` privados no repositorio | `infrastructure/persistence/service-persistence.mapper.ts` |
| `mappers/service.mapper.ts` | `presentation/http/mappers/service-response.mapper.ts` |
| Modulo exportava `ServiceController`, `ServiceCatalogService` e `ServiceRepository` | Modulo exporta so `FindServiceUseCase` |

Contratos HTTP, mensagens publicas, schema e migrations nao mudaram.

## Erros

O modulo ja tinha duas mensagens para "nome repetido": uma de negocio, na pre-checagem, e uma tecnica, quando duas requisicoes correm pelo mesmo nome e o banco rejeita a segunda. As duas foram preservadas como codigos distintos.

| Codigo | `kind` | Status | Mensagem | Onde nasce |
| --- | --- | --- | --- | --- |
| `SERVICE_NOT_FOUND` | `NOT_FOUND` | 404 | `Serviço não encontrado` | caso de uso |
| `SERVICE_NAME_IN_USE` | `CONFLICT` | 409 | `Já existe um serviço com esse nome` | caso de uso, pre-checagem |
| `SERVICE_ALREADY_EXISTS` | `CONFLICT` | 409 | `Service already exists` | repositorio Prisma, `P2002` |

## Quem consome o modulo

`service-order` e `budget` injetam `FindServiceUseCase` para conferir que cada servico referenciado numa OS ou num orcamento existe. Ambos ainda sao legados e consomem o caso de uso diretamente; quando forem migrados, cada um declara a propria porta (`ServiceCatalogPort.exists`). Nos testes E2E, o Prisma e substituido com `overrideProvider(ServiceRepositoryPort).useValue(new InMemoryServiceRepository())`.

## Testes

- Casos de uso: `application/use-cases/service-catalog-use-cases.spec.ts`, com repositorio mockado, sem Nest.
- Repositorio: `infrastructure/persistence/prisma-service.repository.spec.ts` cobre a traducao de `P2002` no insert e no update.
- Fronteira de imports: `service-catalog` listado em `test/architecture/migrated-modules.ts`.
- HTTP: `test/service-catalog.e2e-spec.ts` inalterado no contrato.
