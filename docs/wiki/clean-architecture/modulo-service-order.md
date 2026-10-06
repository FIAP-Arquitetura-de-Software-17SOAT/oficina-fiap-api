# Modulo Service Order

Setimo modulo migrado e o agregado central da oficina: a maquina de estados da ordem de servico. Chegou por ultimo entre os que ele consome de proposito: client, vehicle, service-catalog, notification e stock ja estavam migrados, entao cada porta daqui aponta para um caso de uso definitivo. A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md).

## Estrutura

```text
src/modules/service-order/
  domain/
    entities/service-order.entity.ts
    enums/service-order-status.enum.ts
  application/
    use-cases/open-service-order.use-case.ts
    use-cases/find-service-order.use-case.ts
    use-cases/list-service-orders.use-case.ts
    use-cases/list-service-orders-by-client.use-case.ts
    use-cases/get-average-execution-time.use-case.ts
    use-cases/assign-mechanic.use-case.ts
    use-cases/await-approval.use-case.ts
    use-cases/await-parts.use-case.ts
    use-cases/register-parts-dispatched.use-case.ts
    use-cases/complete-service-order.use-case.ts
    use-cases/await-payment.use-case.ts
    use-cases/deliver-service-order.use-case.ts
    use-cases/cancel-service-order.use-case.ts
    services/service-order-transition.ts
    ports/service-order-repository.port.ts
    ports/client-lookup.port.ts
    ports/vehicle-lookup.port.ts
    ports/service-catalog.port.ts
    ports/part-catalog.port.ts
    ports/service-order-notifier.port.ts
    contracts/service-order.input.ts
    errors/service-order-application.error.ts
  infrastructure/
    persistence/prisma-service-order.repository.ts
    persistence/service-order-persistence.mapper.ts
    integrations/client-lookup.adapter.ts
    integrations/vehicle-lookup.adapter.ts
    integrations/service-catalog.adapter.ts
    integrations/part-catalog.adapter.ts
    notifications/service-order-notifier.adapter.ts
    notifications/service-order-status-changed.email.ts
  presentation/http/
    service-order.controller.ts
    dto/service-order.dto.ts
    mappers/service-order-response.mapper.ts
  service-order.module.ts
```

## O que mudou em relacao ao layout legado

| Antes | Depois |
| --- | --- |
| `entities/`, `enums/` | `domain/`, movidos sem alteracao |
| `services/service-order.service.ts`: 13 metodos numa classe `@Injectable`, injetando `ClientRepositoryPort`, `FindVehicleUseCase`, `FindServiceUseCase`, `FindPartUseCase` e `EnqueueNotificationUseCase` de outros modulos | 13 casos de uso; as transicoes de status compartilham `application/services/service-order-transition.ts` |
| Dependencias diretas em cinco modulos | cinco portas estreitas: `ClientLookupPort.exists`, `VehicleLookupPort.findById -> { id, clientId }`, `ServiceCatalogPort.exists`, `PartCatalogPort.exists`, `ServiceOrderNotifierPort.statusChanged` |
| Template de e-mail em `shared/notifications` e montagem do aviso dentro do service | `infrastructure/notifications/`: o adapter resolve o e-mail do cliente, monta a mensagem e enfileira; o template veio junto |
| Exceções HTTP do Nest no service | `ServiceOrderApplicationError` com sete codigos; `MECHANIC_BUSY` e parametrizado com o id da OS ativa |
| `ServiceOrderController` exportado e chamado por budget, billing e parts-dispatch, com tres metodos sem rota HTTP | o controller so tem rotas; os outros modulos injetam os casos de uso exportados |
| `toDomain`/`toPersistence` privados no repositorio | `service-order-persistence.mapper.ts` |
| `mappers/service-order.mapper.ts` | `presentation/http/mappers/service-order-response.mapper.ts` |

Contratos HTTP, mensagens publicas, schema e migrations nao mudaram.

## O colaborador de transicao

Sete das treze acoes sao "carrega a OS, aplica uma transicao da entidade, grava, avisa o cliente". Em vez de repetir isso sete vezes, `ServiceOrderTransition` faz `load` e `persist`, e `StatusTransitionUseCase` e uma base abstrata em que cada transicao so implementa `apply`:

```typescript
export class CompleteServiceOrderUseCase extends StatusTransitionUseCase {
  protected apply(serviceOrder: ServiceOrder): void {
    serviceOrder.complete();
  }
}
```

A regra de nao avisar em `AWAITING_APPROVAL` (o e-mail do orcamento ja cobre) mora no colaborador. O aviso e disparado com `void`: falha de e-mail nunca desfaz a transicao, e o adapter nunca lanca.

## Portas

| Porta | O que pede | Adapter chama |
| --- | --- | --- |
| `ClientLookupPort.exists` | so se o cliente existe | `FindClientUseCase`, `CLIENT_NOT_FOUND` vira `false` |
| `VehicleLookupPort.findById` | `{ id, clientId }` ou `null`, para conferir o dono | `FindVehicleUseCase` |
| `ServiceCatalogPort.exists` / `PartCatalogPort.exists` | existencia dos itens pedidos | `FindServiceUseCase` / `FindPartUseCase` |
| `ServiceOrderNotifierPort.statusChanged` | aviso de negocio com `clientId`, `serviceOrderId`, `status`, `cancellationReason` | `FindClientUseCase` + template + `EnqueueNotificationUseCase` |

## Erros

| Codigo | `kind` | Status | Mensagem |
| --- | --- | --- | --- |
| `SERVICE_ORDER_NOT_FOUND` | `NOT_FOUND` | 404 | `Service order not found` |
| `CLIENT_NOT_FOUND` | `NOT_FOUND` | 404 | `Client not found` |
| `VEHICLE_NOT_FOUND` | `NOT_FOUND` | 404 | `Vehicle not found` |
| `SERVICE_NOT_FOUND` | `NOT_FOUND` | 404 | `Serviço não encontrado` |
| `PART_NOT_FOUND` | `NOT_FOUND` | 404 | `Peça não encontrada` |
| `VEHICLE_NOT_OWNED_BY_CLIENT` | `INVALID` | 400 | `Vehicle does not belong to the informed client` |
| `MECHANIC_BUSY` | `CONFLICT` | 409 | `Mechanic already has an open service order (<id>)` |

Transicoes invalidas continuam vindo da entidade como `DomainException`, 400.

## Quem consome o modulo

| Consumidor | Casos de uso injetados |
| --- | --- |
| `budget` (legado) | `FindServiceOrderUseCase`, `AwaitApprovalUseCase`, `AwaitPartsUseCase`; o recorte por cliente passa a capturar `SERVICE_ORDER_NOT_FOUND` pelo codigo |
| `billing` (legado) | `FindServiceOrderUseCase`, `AwaitPaymentUseCase`, `DeliverServiceOrderUseCase` |
| `parts-dispatch` | adapter chama `RegisterPartsDispatchedUseCase` |

Nos testes E2E, `overrideProvider(ServiceOrderRepositoryPort)`.

## Testes

- Casos de uso: `application/use-cases/service-order-use-cases.spec.ts`, com as portas falsas, sem Nest.
- Adapters: `infrastructure/integrations/adapters.spec.ts` e `infrastructure/notifications/service-order-notifier.adapter.spec.ts` (inclui o template).
- Fronteira de imports: `service-order` listado em `test/architecture/migrated-modules.ts`.
- HTTP: `test/service-order.e2e-spec.ts`, `customer`, `budget*`, `billing` e `workshop-flow`, inalterados no contrato.
