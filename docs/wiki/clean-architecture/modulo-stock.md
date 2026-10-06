# Modulo Stock

Quinto modulo migrado e o primeiro do antigo cluster de ciclos. Depois da extracao do despacho de pecas para [parts-dispatch](modulo-parts-dispatch.md), o estoque virou **folha**: nao conhece nenhum outro modulo, e quatro modulos dependem dele. A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md).

## Estrutura

```text
src/modules/stock/
  domain/
    entities/part.entity.ts
    value-objects/part-code.vo.ts
    enums/measurement-unit.enum.ts
    enums/part-type.enum.ts
    enums/stock-movement-type.enum.ts
  application/
    use-cases/create-part.use-case.ts
    use-cases/find-part.use-case.ts
    use-cases/list-parts.use-case.ts
    use-cases/update-part.use-case.ts
    use-cases/delete-part.use-case.ts
    use-cases/increase-stock.use-case.ts
    use-cases/decrease-stock.use-case.ts
    services/apply-stock-movement.ts
    ports/part-repository.port.ts
    ports/stock-movement-repository.port.ts
    contracts/part.input.ts
    contracts/stock-movement.ts
    errors/stock-application.error.ts
  infrastructure/
    persistence/prisma-part.repository.ts
    persistence/prisma-stock-movement.repository.ts
    persistence/part-persistence.mapper.ts
  presentation/http/
    part.controller.ts
    dto/part.dto.ts
    dto/stock-movement.dto.ts
    mappers/part-response.mapper.ts
  stock.module.ts
```

## O que mudou em relacao ao layout legado

| Antes | Depois |
| --- | --- |
| `entities/`, `value-objects/`, `enums/` | `domain/`, movidos sem alteracao |
| `services/part.service.ts` e `services/stock-movement.service.ts`, `@Injectable`, com exceções HTTP | sete casos de uso puros; a validacao comum de entrada e saida fica em `application/services/apply-stock-movement.ts` |
| `PartService.rethrowWriteError` interpretava `P2002`, `P2025` e `P2003` do Prisma **dentro do service** | a traducao mora em `infrastructure/persistence/prisma-part.repository.ts`; o caso de uso nunca ve codigo do Prisma |
| `StockMovementRepository` lancava classes proprias (`InsufficientStockError`...) que o service traduzia para HTTP | `prisma-stock-movement.repository.ts` lanca `StockApplicationError` direto; o caso de uso so repassa |
| `toDomain` duplicado nos dois repositorios | um `PartPersistenceMapper` |
| `mappers/part.mapper.ts` | `presentation/http/mappers/part-response.mapper.ts` |
| `@UseGuards(JwtAuthGuard, RolesGuard)` repetido no controller e `AuthModule` importado so por isso | removidos: os dois guards ja sao globais (`APP_GUARD`) |
| Modulo exportava `PartService`, `StockMovementService`, `PartController` e o simbolo `PART_CATALOG` | exporta `FindPartUseCase`, `IncreaseStockUseCase` e `DecreaseStockUseCase` |

Contratos HTTP, mensagens publicas, schema e migrations nao mudaram.

## Por que a movimentacao continua atomica na porta de persistencia

Entrar ou sair estoque precisa gravar o movimento e ajustar o saldo na mesma transacao, com a chave de idempotencia garantida pelo banco (indice unico). Isso e responsabilidade de persistencia, nao de regra de negocio, entao `StockMovementRepositoryPort.apply` continua sendo uma operacao unica. O caso de uso valida a entrada (quantidade inteira positiva, chave presente) e delega. Mover a atomicidade para o caso de uso obrigaria a expor `Prisma.TransactionClient` ao nucleo, o que a proposta da Fase 2 proibe.

## Erros

Dois vocabularios ja existiam na API e foram preservados como codigos distintos: o cadastro de pecas fala portugues e o fluxo de movimentacao fala ingles.

| Codigo | `kind` | Status | Mensagem |
| --- | --- | --- | --- |
| `PART_NOT_FOUND` | `NOT_FOUND` | 404 | `Peça não encontrada` |
| `PART_CODE_IN_USE` | `CONFLICT` | 409 | `Código da peça já cadastrado` |
| `PART_HAS_LINKS` | `CONFLICT` | 409 | `Peça possui movimentações, orçamentos ou pedidos de compra vinculados e não pode ser removida` |
| `MOVEMENT_QUANTITY_INVALID` | `INVALID` | 400 | `Movement quantity must be a positive integer` |
| `IDEMPOTENCY_KEY_REQUIRED` | `INVALID` | 400 | `Idempotency key is required` |
| `INSUFFICIENT_STOCK` | `CONFLICT` | 409 | `Insufficient stock` |
| `IDEMPOTENCY_KEY_CONFLICT` | `CONFLICT` | 409 | `Idempotency key already in use` |
| `MOVEMENT_PART_NOT_FOUND` | `NOT_FOUND` | 404 | `Part not found` |

## Quem consome o modulo

| Consumidor | Antes | Depois |
| --- | --- | --- |
| `service-order` | `PART_CATALOG` (simbolo + interface em `service-order/ports`, fornecido pelo stock com `useExisting: PartController`) | injeta `FindPartUseCase`; a porta antiga foi apagada |
| `budget` | `PartController.findById` | `FindPartUseCase.execute` |
| `purchase-order` | `PartController.findById` e `increaseStock` | `FindPartUseCase` e `IncreaseStockUseCase`; le `part.getUnitPrice()` e `part.getName()` |
| `parts-dispatch` | adapter chamava `PartService` e `StockMovementService` | adapter chama `FindPartUseCase` e `DecreaseStockUseCase`; traduz `PART_NOT_FOUND` em `null` |

Nos testes E2E, `overrideProvider(PartRepositoryPort)` e `overrideProvider(StockMovementRepositoryPort)`. Os fakes em memoria declaram `implements` e lancam `StockApplicationError`.

## Testes

- Casos de uso: `application/use-cases/stock-use-cases.spec.ts`, com as portas mockadas, sem Nest.
- Repositorios: as traducoes de `P2002`/`P2025`/`P2003` e os erros de movimentacao (`INSUFFICIENT_STOCK`, `MOVEMENT_PART_NOT_FOUND`, replay por chave) em `infrastructure/persistence/*.spec.ts`.
- Fronteira de imports: `stock` listado em `test/architecture/migrated-modules.ts`.
- HTTP: `test/stock.e2e-spec.ts` (inclusive 401/403 pelos guards globais) e `test/workshop-flow.e2e-spec.ts` inalterados no contrato.
