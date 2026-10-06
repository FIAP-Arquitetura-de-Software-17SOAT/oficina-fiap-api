# Purchase Order

Agregado **Pedido de Compra (`PurchaseOrder`)**: a compra de peças e insumos junto a um fornecedor quando o estoque não cobre uma ordem de serviço. As regras de domínio e o ciclo de vida do pedido ficam dentro do próprio agregado.

O módulo segue a Clean Architecture da Fase 2. A regra geral está em [`docs/wiki/migracao-clean-architecture.md`](../../../docs/wiki/migracao-clean-architecture.md) e o detalhe deste módulo em [`docs/wiki/clean-architecture/modulo-purchase-order.md`](../../../docs/wiki/clean-architecture/modulo-purchase-order.md).

## Fluxo

```text
NEEDS_PURCHASE  --registerPurchase()-->  AWAITING_DELIVERY  --markAsDelivered()-->  DELIVERED
```

- Itens só podem ser adicionados ou removidos em `NEEDS_PURCHASE`.
- `registerPurchase()` exige pelo menos um item.
- `DELIVERED` é terminal e preenche `deliveredAt`.
- Ao entregar, cada item entra no estoque com chave de idempotência `purchase-order:{pedido}:{item}`, então reentregar não soma duas vezes.

## Estrutura

```text
src/modules/purchase-order/
  domain/            PurchaseOrder, PurchaseOrderItem, PurchaseOrderNumber, PurchaseOrderStatus
  application/       casos de uso, portas (repositório, catálogo de peças, entrada no estoque), contratos e erros
  infrastructure/    repositório Prisma + mapper; adapters para o módulo de estoque
  presentation/http/ controller, DTOs e mapper de resposta
  purchase-order.module.ts
```

`Money` e `Quantity` são compartilhados (`src/shared/domain/value-objects`). O item usa `Quantity.positive` (movimento, maior que zero); `Quantity.create` é o construtor de saldo e aceita zero.

## Casos de uso

| Caso de uso | O que faz |
| --- | --- |
| `CreatePurchaseOrderUseCase` | cria em `NEEDS_PURCHASE` com número informado |
| `RegisterShortageUseCase` | abre o pedido da falta com número sequencial `PC-AAAA-NNNN` e preço copiado do cadastro da peça; usado pelo módulo `parts-dispatch` |
| `AddPurchaseOrderItemUseCase` / `RemovePurchaseOrderItemUseCase` | alteram itens enquanto editável |
| `RegisterPurchaseUseCase` | `NEEDS_PURCHASE → AWAITING_DELIVERY` |
| `MarkPurchaseOrderDeliveredUseCase` | `AWAITING_DELIVERY → DELIVERED` e entrada no estoque pela `StockReceiptPort` |
| `FindPurchaseOrderUseCase` / `ListPurchaseOrdersUseCase` | leitura |
| `ResolvePartNamesQuery` | nome das peças para a resposta HTTP, uma consulta por peça distinta; peça removida sai como `null` |

## Integração com o estoque

O pedido guarda só o `partId`; o nome não é copiado de propósito, porque não é dado acordado com o fornecedor. As duas portas de `application/ports/` dizem o que o pedido precisa do estoque, e os adapters em `infrastructure/integrations/` chamam `FindPartUseCase` e `IncreaseStockUseCase` do módulo `stock`. Quem abre o pedido quando falta peça é o módulo `parts-dispatch`, que importa este e injeta `RegisterShortageUseCase`.

## API

| Método | Rota |
| --- | --- |
| `POST` | `/api/v1/purchase-orders` |
| `POST` | `/api/v1/purchase-orders/shortages` |
| `GET` | `/api/v1/purchase-orders` |
| `GET` | `/api/v1/purchase-orders/{id}` |
| `POST` | `/api/v1/purchase-orders/{id}/items` |
| `DELETE` | `/api/v1/purchase-orders/{id}/items/{itemId}` |
| `PATCH` | `/api/v1/purchase-orders/{id}/register-purchase` |
| `PATCH` | `/api/v1/purchase-orders/{id}/deliver` |

`subtotal` e `total` são derivados (`quantidade × preço unitário`) e nunca persistidos. Swagger em `/api/v1/docs`, seção `purchase-orders`.

## Erros

| Código | Status | Mensagem |
| --- | --- | --- |
| `PURCHASE_ORDER_NOT_FOUND` | 404 | `Pedido de compra não encontrado` |
| `PART_NOT_FOUND` | 404 | `Peça não encontrada` |
| `PURCHASE_ORDER_NUMBER_IN_USE` | 409 | `Purchase order number already exists` |

Violações de estado vêm da entidade como `DomainException`, 400.

## Testes

```bash
npm test -- purchase-order
```

Casos de uso testados com as portas falsas, sem Nest; adapters e repositório com specs próprias; fluxo completo pelo HTTP em `test/workshop-flow.e2e-spec.ts`.
