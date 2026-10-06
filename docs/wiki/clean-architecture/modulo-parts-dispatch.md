# Modulo Parts Dispatch

Modulo **novo**, criado na migracao. Nao e um agregado: e um modulo de fluxo que orquestra quatro agregados (orcamento, estoque, ordem de servico e pedido de compra) para executar a politica "solicitar pecas" do Event Storming. Ele nasceu para desfazer os ciclos entre modulos da Fase 1. A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md).

## De onde veio

Na Fase 1 o despacho de pecas era o `PartsDispatchService`, dentro de `stock`. Ele lia o orcamento aceito da OS (`BudgetController`), baixava o estoque (`StockMovementService`), avisava a OS (`ServiceOrderController`) e, faltando peca, abria pedido de compra (`PurchaseOrderController`). Como orcamento, OS e pedido de compra tambem consultam o estoque, o resultado eram tres ciclos, todos fechados com `forwardRef`:

```text
budget <-> stock      service-order <-> stock      purchase-order <-> stock
```

O ciclo era o sintoma. A causa era uma orquestracao de quatro agregados morando dentro de um deles. Movida para um modulo proprio, que importa os quatro e nao e importado por nenhum, o grafo vira aciclico:

```text
stock           -> []
purchase-order  -> [stock]
service-order   -> [client, vehicle, service-catalog, notification, stock]
budget          -> [service-order, service-catalog, client, notification, stock]
parts-dispatch  -> [stock, budget, service-order, purchase-order]
```

Os dez `forwardRef` do projeto sumiram, e o teste de grafo em `src/architecture.spec.ts` passou a exigir zero ciclos e zero `forwardRef`.

## Estrutura

```text
src/modules/parts-dispatch/
  application/
    use-cases/dispatch-parts-for-service-order.use-case.ts
    ports/accepted-budgets.port.ts
    ports/stock.port.ts
    ports/service-order-dispatch.port.ts
    ports/shortage-purchase.port.ts
    contracts/dispatch-result.ts
    errors/parts-dispatch-application.error.ts
  infrastructure/
    integrations/budget.adapter.ts
    integrations/stock.adapter.ts
    integrations/service-order.adapter.ts
    integrations/purchase-order.adapter.ts
  presentation/http/
    parts-dispatch.controller.ts
    dto/parts-dispatch.dto.ts
  parts-dispatch.module.ts
```

Nao ha `domain/`: o modulo nao tem entidade propria. O que ele produz e um `DispatchResult`, contrato de aplicacao.

## Portas

Cada porta expoe so o que o caso de uso precisa, com tipos proprios. Nenhuma entidade, DTO ou erro dos fornecedores entra em `application/`.

| Porta | O que pede | Adapter chama hoje |
| --- | --- | --- |
| `AcceptedBudgetsPort.findAccepted(serviceOrderId)` | orcamentos aceitos com `id`, `version` e os itens de peca (`partId`, `description`, `quantity`) | `BudgetService.findByServiceOrderId` |
| `StockPort.findPart(id)` / `decrease(id, qty, key)` | peca como `{ id, name, quantity }` ou `null`; baixa idempotente | `PartService.findById`, `StockMovementService.decrease` |
| `ServiceOrderDispatchPort.registerPartsDispatched(id)` | mover a OS depois da baixa | `ServiceOrderService.registerPartsDispatched` |
| `ShortagePurchasePort.registerShortage(items)` | abrir pedido com a diferenca, devolve `{ id }` | `PurchaseOrderService.registerShortage` |

Os quatro fornecedores ainda sao legados. Quando cada um migrar, so o adapter correspondente muda (passa a chamar o caso de uso exportado); o caso de uso de despacho e o teste dele nao sabem.

## Erros

| Codigo | `kind` | Status | Mensagem |
| --- | --- | --- | --- |
| `NO_ACCEPTED_BUDGET` | `INVALID` | 400 | `Service order has no accepted budget to dispatch parts for` |
| `PART_ITEM_WITHOUT_REFERENCE` | `INVALID` | 400 | `Accepted budget has part items without a part reference: <descricoes>` |
| `PART_NOT_FOUND` | `NOT_FOUND` | 404 | `Peça não encontrada` |

E o primeiro modulo com **mensagem parametrizada**: a tabela de codigos guarda uma funcao `(params) => string`, e o construtor recebe os parametros. Estoque insuficiente numa corrida continua subindo do modulo de estoque como 409.

## HTTP

`POST /api/v1/parts/service-orders/:serviceOrderId/dispatch`, tag `parts`, mesmos papeis e mesma documentacao Swagger de antes. O `PartController` do estoque perdeu essa rota; o contrato publico nao mudou.

## Testes

- Caso de uso: `application/use-cases/dispatch-parts-for-service-order.use-case.spec.ts`, com as quatro portas falsas. Cobre saldo suficiente, falta com pedido de compra, maior versao aceita, arredondamento, orcamento so de servicos e os tres erros.
- Adapters: `infrastructure/integrations/adapters.spec.ts`.
- Fluxo completo pelo HTTP: `test/workshop-flow.e2e-spec.ts` e `test/billing.e2e-spec.ts`, inalterados.
