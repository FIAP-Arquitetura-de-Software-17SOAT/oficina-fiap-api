# Modulo Billing

Nono modulo migrado e o topo do grafo: ninguem depende da cobranca, e ela depende de budget, service-order, client e notification, todos ja migrados. E o modulo com integracao externa (Stripe), tres entradas para o mesmo pagamento (webhook, retorno de sucesso, retorno de cancelamento) e o `PaymentGateway`, que ja nasceu como porta abstrata no layout legado. A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md).

## Estrutura

```text
src/modules/billing/
  domain/
    entities/billing.entity.ts
    enums/billing-status.enum.ts
    enums/payment-method.enum.ts
    value-objects/penalty.vo.ts
  application/
    use-cases/generate-billing.use-case.ts
    use-cases/find-billing.use-case.ts
    use-cases/find-billing-by-service-order.use-case.ts
    use-cases/list-billings.use-case.ts
    use-cases/expire-billing.use-case.ts
    use-cases/renew-payment-link.use-case.ts
    use-cases/handle-payment-webhook.use-case.ts
    use-cases/confirm-payment-return.use-case.ts
    use-cases/register-payment-cancellation.use-case.ts
    use-cases/deliver-billed-service-order.use-case.ts
    services/billing-store.ts
    services/payment-link-issuer.ts
    services/payment-settlement.ts
    ports/billing-repository.port.ts
    ports/payment-gateway.port.ts
    ports/service-order.port.ts
    ports/accepted-budget.port.ts
    ports/billing-notifier.port.ts
    contracts/billing.input.ts
    errors/billing-application.error.ts
  infrastructure/
    persistence/prisma-billing.repository.ts
    persistence/billing-persistence.mapper.ts
    payment/stripe-payment.gateway.ts
    payment/fake-payment.gateway.ts
    integrations/service-order.adapter.ts
    integrations/accepted-budget.adapter.ts
    notifications/billing-notifier.adapter.ts
    notifications/payment-link-ready.email.ts
  presentation/http/
    billing.controller.ts
    payment.controller.ts
    dto/billing.dto.ts
    mappers/billing-response.mapper.ts
  billing.module.ts
```

## O que mudou em relacao ao layout legado

| Antes | Depois |
| --- | --- |
| `entities/`, `enums/`, `value-objects/` | `domain/`, movidos sem alteracao |
| `gateways/payment-gateway.ts`: classe abstrata `PaymentGateway`, ja uma porta, mas na pasta errada e com o nome sem sufixo | `application/ports/payment-gateway.port.ts`, `PaymentGatewayPort`; Stripe e Fake em `infrastructure/payment/` |
| `services/billing.service.ts`: 10 metodos publicos e 7 privados, injetando `FindAcceptedBudgetUseCase`, tres casos de uso de service-order, `ClientRepositoryPort` e `EnqueueNotificationUseCase` | 10 casos de uso; o que se repetia virou tres colaboradores em `application/services/` |
| Dependencias diretas em quatro modulos | quatro portas estreitas + a do gateway |
| `isUniqueViolation` dentro do service para "ja existe cobranca" | o repositorio Prisma traduz em `BILLING_ALREADY_EXISTS`, o mesmo codigo da pre-checagem |
| Exceções HTTP do Nest no service | `BillingApplicationError` com onze codigos; os tres de entrada invalida (`PAYMENT_LINK_NOT_EXPIRED`, `INVALID_WEBHOOK_SIGNATURE`, `CHECKOUT_SESSION_REQUIRED`) sao `kind: INVALID`, 400 |
| `PaymentReturn` carregava a entidade `ServiceOrder` de outro modulo | `PaymentReturn.serviceOrder` e o `ServiceOrderSummary` da porta (`{ id, clientId, status }`) |
| E-mail do cliente via `ClientRepositoryPort` do modulo client, template em `shared/notifications` | `BillingNotifierPort.paymentLinkReady`; o adapter resolve o cliente por `FindClientUseCase` e o template mora no modulo |
| `mappers/billing.mapper.ts` com persistencia e resposta juntas | `infrastructure/persistence/billing-persistence.mapper.ts` e `presentation/http/mappers/billing-response.mapper.ts` |
| `BillingService` exportado | o modulo nao exporta nada: ninguem depende dele |

Contratos HTTP, mensagens publicas, rotas publicas (webhook do Stripe, `payment/success`, `payment/cancel`), schema e migrations nao mudaram. Em `shared/notifications` sobrou so `escapeHtml` e `EmailContent`, que saem na PR10.

## Os tres colaboradores

- `BillingStore`: carregar por id ou por sessao de checkout (404 quando nao existe), exigir a OS pela porta (404 `Service order not found`) e gravar com compare-and-set (`BILLING_CONCURRENT_UPDATE`).
- `PaymentLinkIssuer`: abrir a sessao no gateway com chave de idempotencia nova a cada tentativa e **registrar a sessao antes** de a cobranca mudar de estado. Se a gravacao da cobranca perder a corrida, o webhook dessa sessao ainda encontra a cobranca e quita. Usado por gerar e por renovar.
- `PaymentSettlement`: o caminho unico de quitacao. Webhook, retorno de sucesso e retorno de cancelamento chegam aqui e disputam a mesma cobranca, entao tudo tolera repeticao: cobranca ja paga devolve o que esta gravado; perder o compare-and-set para quem ja quitou tambem. So e conflito quando ninguem quitou.

## Fluxo de pagamento

```text
POST /billings                    -> GenerateBilling: cria (ou reaproveita PENDING), abre link, grava, avisa cliente
POST /billings/stripe/webhook     -> HandlePaymentWebhook: gateway valida a assinatura -> settle
GET  /payment/success?session_id  -> ConfirmPaymentReturn: pergunta ao gateway; pago -> settle + deliver; senao nada muda
GET  /payment/cancel?billing_id   -> RegisterPaymentCancellation: pergunta ao gateway; pago -> settle + deliver; senao OS em AWAITING_PAYMENT
POST /billings/:id/renew-payment-link -> RenewPaymentLink: multa + juros no gateway, valor da cobranca nao muda
```

As URLs de retorno chegam pelo navegador do cliente e nao provam nada: o estado do pagamento e sempre relido no gateway antes de mexer em cobranca ou OS.

## Portas

| Porta | O que pede | Adapter chama |
| --- | --- | --- |
| `BillingRepositoryPort` | CRUD, `findByGatewayTransactionId`, `registerCheckoutSession`, `recordCheckoutSessionPayment` (idempotente) e `update` compare-and-set | Prisma |
| `PaymentGatewayPort` | `createPaymentLink`, `parsePaymentWebhook`, `getPaymentStatus` | Stripe Checkout; `FakePaymentGateway` nos e2e |
| `ServiceOrderPort` | `findById -> { id, clientId, status } \| null`, `awaitPayment`, `deliver` | `FindServiceOrderUseCase`, `AwaitPaymentUseCase`, `DeliverServiceOrderUseCase` |
| `AcceptedBudgetPort.findAccepted` | `{ id, total: Money } \| null` | `FindAcceptedBudgetUseCase` |
| `BillingNotifierPort.paymentLinkReady` | `serviceOrderId`, `total`, `paymentLink` | `FindServiceOrderUseCase` + `FindClientUseCase` + template + `EnqueueNotificationUseCase` |

## Erros

| Codigo | `kind` | Status | Mensagem |
| --- | --- | --- | --- |
| `BILLING_NOT_FOUND` | `NOT_FOUND` | 404 | `Cobrança não encontrada` |
| `SERVICE_ORDER_NOT_FOUND` | `NOT_FOUND` | 404 | `Service order not found` |
| `SERVICE_ORDER_NOT_COMPLETED` | `CONFLICT` | 409 | `A ordem de serviço precisa estar finalizada para gerar cobrança` |
| `BILLING_ALREADY_EXISTS` | `CONFLICT` | 409 | `Já existe cobrança para esta ordem de serviço` |
| `NO_ACCEPTED_BUDGET` | `CONFLICT` | 409 | `É preciso um orçamento aceito para gerar a cobrança` |
| `BILLING_PAID_IS_TERMINAL` | `CONFLICT` | 409 | `Cobrança paga é terminal` |
| `BILLING_NOT_PAID` | `CONFLICT` | 409 | `A cobrança precisa estar paga para entregar a OS` |
| `BILLING_CONCURRENT_UPDATE` | `CONFLICT` | 409 | `A cobrança foi alterada por outra requisição` |
| `PAYMENT_LINK_NOT_EXPIRED` | `INVALID` | 400 | `O link de pagamento da cobrança ainda não expirou` |
| `INVALID_WEBHOOK_SIGNATURE` | `INVALID` | 400 | `Assinatura do webhook do Stripe inválida` |
| `CHECKOUT_SESSION_REQUIRED` | `INVALID` | 400 | `O id da sessão de checkout é obrigatório` |

`InvalidPaymentWebhookSignatureError` continua sendo o erro da porta do gateway; o caso de uso do webhook o traduz em `INVALID_WEBHOOK_SIGNATURE`.

## Quem consome o modulo

Ninguem. `app.module.ts` importa o `BillingModule` pelas rotas. Nos testes E2E, `overrideProvider(BillingRepositoryPort)` e `overrideProvider(PaymentGatewayPort)`; `test/in-memory-billing.repository.ts` implementa a porta.

## Testes

- Casos de uso: `application/use-cases/billing-use-cases.spec.ts`, com as portas mockadas, sem Nest; cobre as corridas do webhook e os dois retornos do checkout.
- Adapters: `infrastructure/integrations/adapters.spec.ts` e `infrastructure/notifications/billing-notifier.adapter.spec.ts` (inclui o template).
- Gateway: `infrastructure/payment/*.spec.ts`, movidos.
- Fronteira de imports: `billing` listado em `test/architecture/migrated-modules.ts`.
- HTTP: `test/billing.e2e-spec.ts`, `billing-webhook-auth` e `workshop-flow`, inalterados no contrato.
