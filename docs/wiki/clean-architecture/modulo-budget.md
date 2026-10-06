# Modulo Budget

Oitavo modulo migrado e o maior service do projeto: orcamento com versoes por OS, link de aprovacao por e-mail, webhook HTML e recorte por cliente. Chegou depois de service-order, service-catalog, stock, client e notification de proposito: cada porta daqui ja aponta para um caso de uso definitivo. A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md).

## Estrutura

```text
src/modules/budget/
  domain/
    entities/budget.entity.ts
    enums/budget-item-type.enum.ts
    enums/budget-status.enum.ts
    value-objects/approval-token.vo.ts
  application/
    use-cases/create-budget.use-case.ts
    use-cases/add-budget-item.use-case.ts
    use-cases/remove-budget-item.use-case.ts
    use-cases/calculate-budget-total.use-case.ts
    use-cases/send-budget.use-case.ts
    use-cases/accept-budget.use-case.ts
    use-cases/refuse-budget.use-case.ts
    use-cases/apply-external-decision.use-case.ts
    use-cases/find-budget-by-approval-token.use-case.ts
    use-cases/find-budget.use-case.ts
    use-cases/list-budgets.use-case.ts
    use-cases/list-budgets-by-service-order.use-case.ts
    use-cases/find-accepted-budget.use-case.ts
    services/budget-store.ts
    services/budget-item-references.ts
    ports/budget-repository.port.ts
    ports/service-order.port.ts
    ports/service-catalog.port.ts
    ports/part-catalog.port.ts
    ports/budget-notifier.port.ts
    contracts/budget.input.ts
    errors/budget-application.error.ts
  infrastructure/
    persistence/prisma-budget.repository.ts
    persistence/budget-persistence.mapper.ts
    integrations/service-order.adapter.ts
    integrations/service-catalog.adapter.ts
    integrations/part-catalog.adapter.ts
    notifications/budget-notifier.adapter.ts
    notifications/budget.emails.ts
  presentation/http/
    budget.controller.ts
    budget-webhook.controller.ts
    dto/budget.dto.ts
    dto/budget-webhook.dto.ts
    mappers/budget-response.mapper.ts
    views/approval-page.view.ts
  budget.module.ts
```

## O que mudou em relacao ao layout legado

| Antes | Depois |
| --- | --- |
| `entities/`, `enums/`, `value-objects/` | `domain/`, movidos sem alteracao |
| `services/budget.service.ts`: 620 linhas, 13 metodos publicos, injetando repositorio Prisma, tres casos de uso de service-order, `FindServiceUseCase`, `FindPartUseCase`, `ClientRepositoryPort`, `EnqueueNotificationUseCase` e `ConfigService` | 13 casos de uso pequenos; o que se repetia virou dois colaboradores em `application/services/` |
| Dependencias diretas em cinco modulos | cinco portas estreitas, cada uma com o minimo que o orcamento precisa |
| `catch` de `P2002` dentro do service, lendo `meta.target` e `meta.driverAdapterError` | o repositorio Prisma traduz a unicidade em `BUDGET_VERSION_TAKEN` (versao) ou `BUDGET_VERSION_ALLOCATION` (outra); o caso de uso repete a alocacao pelo **codigo**, sem saber o que e Prisma |
| Recorte do CUSTOMER por `catch (SERVICE_ORDER_NOT_FOUND)` do caso de uso alheio | `ServiceOrderPort.findById` devolve `null`; o adapter faz a traducao |
| E-mail do cliente via `ClientRepositoryPort` do modulo client, URL do link montada com `ConfigService` + `API_PREFIX`, e-mail do estoque validado com `isEmail`, tudo dentro do service | `BudgetNotifierPort` com dois avisos de negocio (`budgetReady`, `stockPartsRequested`); o adapter resolve destinatarios, URL, templates e nunca lanca |
| `budgetReadyEmail` e `stockPartsRequestedEmail` em `shared/notifications` | `infrastructure/notifications/budget.emails.ts`; em `shared` sobrou so `escapeHtml`, `EmailContent` e o template do billing |
| Exceções HTTP do Nest no service | `BudgetApplicationError` com 12 codigos, tres deles parametrizados |
| Webhook HTML capturando `HttpException` e escolhendo a pagina pelo status | captura `ApplicationError` e escolhe pelo `kind`; o status vem de `statusFor(kind)`, o mesmo do filtro global |
| `mappers/budget.mapper.ts` com `toResponse` e `toPersistence` juntos | `infrastructure/persistence/budget-persistence.mapper.ts` e `presentation/http/mappers/budget-response.mapper.ts` |
| `BudgetDecision` (enum) declarado no DTO | declarado em `application/contracts/`; o DTO reexporta |
| `BudgetService` exportado e injetado por billing e parts-dispatch | exporta `ListBudgetsByServiceOrderUseCase` e `FindAcceptedBudgetUseCase` |

Contratos HTTP, mensagens publicas, paginas HTML, schema e migrations nao mudaram.

## Os dois colaboradores

Dos treze casos de uso, nove comecam com "carrega o orcamento respeitando o recorte do cliente" e cinco terminam com "grava com compare-and-set e reclama se outra requisicao chegou antes". Isso virou `BudgetStore` (`findVisible`, `isVisibleTo`, `persistGenerated`, `persistWaitingApprovalDecision`). A conferencia de que `serviceId` e `partId` existem nos catalogos, usada por criar e por adicionar item, virou `BudgetItemReferences`, que tambem converte o preco decimal da API em `Money`.

O recorte do CUSTOMER continua passando pela OS: o orcamento nao guarda o cliente, entao um orcamento de OS de outro cliente responde 404, como se nao existisse.

## Versao com retry pelo codigo

A versao do orcamento e alocada por leitura + gravacao (`findLastVersionByServiceOrderId` + 1). Duas requisicoes simultaneas leem o mesmo numero e o banco decide quem perdeu. Antes, o service lia o `meta` do erro do Prisma para saber se a unicidade violada era a de versao. Agora:

```typescript
// infrastructure: traduz a unicidade
const fields = uniqueViolationFields(error);
const versionRace = fields.some(f => f.includes('serviceOrderId')) && fields.some(f => f.includes('version'));
throw new BudgetApplicationError(versionRace ? 'BUDGET_VERSION_TAKEN' : 'BUDGET_VERSION_ALLOCATION');

// application: tenta de novo pelo codigo, ate tres vezes
const lostRace = error instanceof BudgetApplicationError && error.code === 'BUDGET_VERSION_TAKEN';
if (lostRace && attempt < MAX_VERSION_ALLOCATION_ATTEMPTS) continue;
throw error;
```

`uniqueViolationFields` em `src/shared/database/prisma-errors.ts` passou a ler tambem `meta.driverAdapterError.cause.constraint.fields`, a forma que o Prisma com driver adapter devolve; antes so o service do orcamento tratava isso.

## Portas

| Porta | O que pede | Adapter chama |
| --- | --- | --- |
| `BudgetRepositoryPort` | CRUD, `findByApprovalTokenHash`, e os dois compare-and-set `updateGenerated` / `updateWaitingApproval` | Prisma, em `$transaction` com `updateMany` condicionado a status + `updatedAt` |
| `ServiceOrderPort.findById` | `{ id, clientId, status }` ou `null` | `FindServiceOrderUseCase`; `SERVICE_ORDER_NOT_FOUND` vira `null` |
| `ServiceOrderPort.awaitApproval` / `awaitParts` | as duas politicas do Event Storming | `AwaitApprovalUseCase` / `AwaitPartsUseCase` |
| `ServiceCatalogPort.exists` / `PartCatalogPort.exists` | existencia das referencias dos itens | `FindServiceUseCase` / `FindPartUseCase` |
| `BudgetNotifierPort.budgetReady` | itens, total, token e vencimento do link | `FindServiceOrderUseCase` + `FindClientUseCase` (e-mail do cliente) + `PUBLIC_API_URL` + template + `EnqueueNotificationUseCase` |
| `BudgetNotifierPort.stockPartsRequested` | pecas do orcamento aceito | `STOCK_NOTIFICATION_EMAIL` validado com `isEmail` + template + `EnqueueNotificationUseCase` |

O caso de uso entrega o **token** ao notifier; quem monta a URL `/budgets/webhooks/decision?token=...` e o adapter, porque `PUBLIC_API_URL` e `API_PREFIX` sao infraestrutura.

## Erros

| Codigo | `kind` | Status | Mensagem |
| --- | --- | --- | --- |
| `BUDGET_NOT_FOUND` | `NOT_FOUND` | 404 | `Orçamento não encontrado` |
| `SERVICE_ORDER_NOT_FOUND` | `NOT_FOUND` | 404 | `Ordem de serviço não encontrada` |
| `SERVICE_NOT_FOUND` | `NOT_FOUND` | 404 | `Serviço não encontrado` |
| `PART_NOT_FOUND` | `NOT_FOUND` | 404 | `Peça não encontrada` |
| `APPROVAL_LINK_INVALID` | `NOT_FOUND` | 404 | `Link de aprovação inválido` |
| `APPROVAL_LINK_EXPIRED` | `GONE` | 410 | `Link de aprovação vencido; peça à oficina um novo orçamento` |
| `BUDGET_ALREADY_ANSWERED` | `CONFLICT` | 409 | `O orçamento já foi aceito` / `recusado` |
| `SERVICE_ORDER_CLOSED` | `CONFLICT` | 409 | `Ordem de serviço <status> não aceita novo orçamento` |
| `BUDGET_WAITING_APPROVAL` | `CONFLICT` | 409 | `A versão <n> do orçamento aguarda aprovação do cliente; aceite ou recuse antes de gerar outra` |
| `BUDGET_VERSION_TAKEN` | `CONFLICT` | 409 | `Não foi possível alocar a versão do orçamento` (so escapa apos 3 tentativas) |
| `BUDGET_VERSION_ALLOCATION` | `CONFLICT` | 409 | `Não foi possível alocar a versão do orçamento` |
| `BUDGET_CONCURRENT_UPDATE` | `CONFLICT` | 409 | `O status do orçamento foi alterado por outra requisição` |

O webhook HTML escolhe o titulo da pagina pelo `kind`: `NOT_FOUND` → "Link inválido", `GONE` → "Link vencido", `CONFLICT` → "Orçamento já respondido". Erros que nao sao `ApplicationError` (dominio, validacao) sobem para os filtros globais, como antes.

## Quem consome o modulo

| Consumidor | Casos de uso injetados |
| --- | --- |
| `billing` (legado) | `FindAcceptedBudgetUseCase`; a regra "aceito de maior versao" saiu do `BillingService` e mora num lugar so |
| `parts-dispatch` | adapter chama `ListBudgetsByServiceOrderUseCase` |

Nos testes E2E, `overrideProvider(BudgetRepositoryPort)`; `test/in-memory-budget.repository.ts` implementa a porta.

## Testes

- Casos de uso: `application/use-cases/budget-use-cases.spec.ts`, com um repositorio em memoria que reproduz o compare-and-set, sem Nest.
- Adapters: `infrastructure/integrations/adapters.spec.ts` e `infrastructure/notifications/budget-notifier.adapter.spec.ts` (inclui os templates).
- Repositorio: `infrastructure/persistence/prisma-budget.repository.spec.ts`, com a traducao das quatro formas de `P2002`.
- Webhook e paginas: `presentation/http/budget-webhook.controller.spec.ts` e `views/approval-page.view.spec.ts`, novos; antes so o e2e cobria.
- Fronteira de imports: `budget` listado em `test/architecture/migrated-modules.ts`.
- HTTP: `test/budget.e2e-spec.ts`, `budget-webhook`, `budget-item-refs`, `billing`, `customer` e `workshop-flow`, inalterados no contrato.
