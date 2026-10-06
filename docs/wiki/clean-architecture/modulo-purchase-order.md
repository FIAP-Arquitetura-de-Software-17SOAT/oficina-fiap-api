# Modulo Purchase Order

Sexto modulo migrado. Depende so de `stock` (ja migrado) e e consumido por `parts-dispatch`. Traz a primeira porta cujo contrato carrega um value object compartilhado (`Money`), e um caso de uso de consulta (`ResolvePartNamesQuery`) que existe para a resposta HTTP, nao para regra de negocio. A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md).

## Estrutura

```text
src/modules/purchase-order/
  domain/
    entities/purchase-order.entity.ts
    entities/purchase-order-item.entity.ts
    value-objects/purchase-order-number.vo.ts
    enums/purchase-order-status.enum.ts
  application/
    use-cases/create-purchase-order.use-case.ts
    use-cases/find-purchase-order.use-case.ts
    use-cases/list-purchase-orders.use-case.ts
    use-cases/add-purchase-order-item.use-case.ts
    use-cases/remove-purchase-order-item.use-case.ts
    use-cases/register-purchase.use-case.ts
    use-cases/mark-purchase-order-delivered.use-case.ts
    use-cases/register-shortage.use-case.ts
    use-cases/resolve-part-names.query.ts
    ports/purchase-order-repository.port.ts
    ports/part-catalog.port.ts
    ports/stock-receipt.port.ts
    contracts/purchase-order.input.ts
    errors/purchase-order-application.error.ts
  infrastructure/
    persistence/prisma-purchase-order.repository.ts
    persistence/purchase-order-persistence.mapper.ts
    integrations/part-catalog.adapter.ts
    integrations/stock-receipt.adapter.ts
  presentation/http/
    purchase-order.controller.ts
    dto/purchase-order.dto.ts
    mappers/purchase-order-response.mapper.ts
  purchase-order.module.ts
```

## O que mudou em relacao ao layout legado

| Antes | Depois |
| --- | --- |
| `entities/`, `value-objects/`, `enums/` | `domain/`, movidos sem alteracao |
| `services/purchase-order.service.ts`, `@Injectable`, injetava `FindPartUseCase` e `IncreaseStockUseCase` do stock diretamente | oito casos de uso e uma query, puros; o stock e alcancado por duas portas |
| Chamada direta ao stock dentro do service | `PartCatalogPort.findById` (nome + preco) e `StockReceiptPort.increase`, com adapters em `infrastructure/integrations/` |
| `NotFoundException` do Nest no service; `ConflictException` no repositorio | `PurchaseOrderApplicationError` com `PURCHASE_ORDER_NOT_FOUND`, `PART_NOT_FOUND` e `PURCHASE_ORDER_NUMBER_IN_USE` |
| `resolvePartNames` no service, engolindo qualquer erro do stock com `catch {}` | `ResolvePartNamesQuery` recebe `null` da porta quando a peca nao existe; erros inesperados sobem |
| `toDomain` privado no repositorio | `purchase-order-persistence.mapper.ts` |
| `mappers/purchase-order.mapper.ts` | `presentation/http/mappers/purchase-order-response.mapper.ts` |
| Modulo exportava `PurchaseOrderService` | exporta `RegisterShortageUseCase` |

Contratos HTTP, mensagens publicas, schema e migrations nao mudaram.

## Portas

| Porta | O que pede | Adapter chama |
| --- | --- | --- |
| `PartCatalogPort.findById(partId)` | `{ id, name, unitPrice: Money }` ou `null` | `FindPartUseCase`, traduzindo `PART_NOT_FOUND` em `null` |
| `StockReceiptPort.increase(partId, quantity, key)` | entrada idempotente no estoque | `IncreaseStockUseCase` |

`Money` pode aparecer no contrato da porta porque vive em `src/shared/domain`, que `application/` pode importar. O que nao pode aparecer e a entidade `Part` do stock: por isso o adapter projeta a peca no tipo `CatalogPart` da porta.

## Erros

| Codigo | `kind` | Status | Mensagem |
| --- | --- | --- | --- |
| `PURCHASE_ORDER_NOT_FOUND` | `NOT_FOUND` | 404 | `Pedido de compra não encontrado` |
| `PART_NOT_FOUND` | `NOT_FOUND` | 404 | `Peça não encontrada` |
| `PURCHASE_ORDER_NUMBER_IN_USE` | `CONFLICT` | 409 | `Purchase order number already exists` |

Regras de estado (registrar compra sem itens, alterar depois de registrada, entregar antes da compra) continuam na entidade como `DomainException`, 400.

## Quem consome o modulo

`parts-dispatch` injeta `RegisterShortageUseCase` pelo adapter dele. No E2E, `overrideProvider(PurchaseOrderRepositoryPort)`.

## Testes

- Casos de uso: `application/use-cases/purchase-order-use-cases.spec.ts`, com repositorio e as duas portas falsos, sem Nest.
- Adapters: `infrastructure/integrations/adapters.spec.ts`.
- Fronteira de imports: `purchase-order` listado em `test/architecture/migrated-modules.ts`.
- HTTP: `test/purchase-order-security.e2e-spec.ts` e `test/workshop-flow.e2e-spec.ts` inalterados no contrato.
