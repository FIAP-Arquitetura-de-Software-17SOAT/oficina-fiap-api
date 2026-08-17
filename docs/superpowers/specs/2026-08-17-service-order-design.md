# Ordem de Serviço (ServiceOrder) — Design

## Contexto

Repositório usa DDD em camadas (`entities`, `value-objects`, `repositories`, `services`, `controllers`, `mappers`, `dto` por módulo — ver `src/modules/client`). Este spec cobre o EPIC "Ordem de Serviço" do board (tasks 22–34):

- Criar Aggregate Ordem de Serviço
- Criar enum de status da OS
- Definir regras de transição de status
- Criar contrato `ServiceOrderRepository`
- Casos de uso: Abrir OS, Consultar OS, Iniciar Diagnóstico, Aguardar Aprovação, Aguardar Peças, Iniciar Serviço, Finalizar OS, Cancelar OS
- Testes unitários da OS

Fora de escopo: módulo Veículo (ainda não existe), Diagnóstico, Orçamento, Estoque, Pagamento — epics futuros. Este módulo não depende deles; integração entra depois, no EPIC "Integração dos Fluxos".

## Decisões

- **`clientId`**: valida existência via `ClientRepository.findById` (módulo Cliente já existe).
- **`vehicleId`**: string opaca, só validação de formato (não vazio) — sem checar existência, já que módulo Veículo não existe. Validação cross-aggregate fica para o EPIC de Integração.
- **Enum de status em inglês** (`ServiceOrderStatus`), consistente com identificadores do resto do código (`Client`, `ClientRepository`); mensagens de erro de domínio em português, como em `Client`/`CpfCnpj`.
- **`description`** obrigatório em `Abrir OS` — texto livre do problema relatado / serviço solicitado.
- **`Consultar OS`**: `findById` (404 se não achar) + `findAll` (sem filtro, ordenado por `createdAt desc`) — mesmo padrão de `Client`.
- **Cancelar OS** exige `reason` (motivo) obrigatório, guardado na OS.
- **Testes**: unitários (entity, repository, service, controller) + e2e com `InMemoryServiceOrderRepository`, replicando o padrão completo do módulo Cliente.

## Domínio

### Aggregate `ServiceOrder`

`src/modules/service-order/entities/service-order.entity.ts`

Props: `id` (uuid), `clientId` (string), `vehicleId` (string), `description` (string), `status` (`ServiceOrderStatus`), `cancellationReason` (string | null), `createdAt`, `updatedAt`.

`static create(props)`: valida `clientId`/`vehicleId`/`description` não vazios (lança `DomainException` senão); status inicial `RECEIVED`. `static restore(id, props)`: reconstrói a partir do banco.

### Enum `ServiceOrderStatus`

`src/modules/service-order/enums/service-order-status.enum.ts`

```ts
export enum ServiceOrderStatus {
  RECEIVED = 'RECEIVED',
  IN_DIAGNOSIS = 'IN_DIAGNOSIS',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  AWAITING_PARTS = 'AWAITING_PARTS',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
```

### Regras de transição

Tabela estática dentro da entity (`Record<ServiceOrderStatus, ServiceOrderStatus[]>`):

```
RECEIVED          → IN_DIAGNOSIS, CANCELLED
IN_DIAGNOSIS      → AWAITING_APPROVAL, CANCELLED
AWAITING_APPROVAL → AWAITING_PARTS, IN_PROGRESS, CANCELLED
AWAITING_PARTS    → IN_PROGRESS, CANCELLED
IN_PROGRESS       → COMPLETED, CANCELLED
COMPLETED         → (terminal)
CANCELLED         → (terminal)
```

Métodos públicos da entity, cada um delegando a um `transitionTo(target)` privado que lança `DomainException` se a transição não está na tabela:

- `startDiagnosis()` → `IN_DIAGNOSIS`
- `awaitApproval()` → `AWAITING_APPROVAL`
- `awaitParts()` → `AWAITING_PARTS`
- `startProgress()` → `IN_PROGRESS`
- `complete()` → `COMPLETED`
- `cancel(reason: string)` → `CANCELLED`; exige `reason` não vazio (`DomainException` senão); grava `cancellationReason`.

`transitionTo` também atualiza `updatedAt` (mesmo padrão de `touch()` do `Client`).

## Persistência

### Prisma schema

```prisma
model ServiceOrder {
  id                 String   @id
  clientId           String
  vehicleId          String
  description        String
  status             String
  cancellationReason String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("service_order")
}
```

Status como `String` (não enum nativo do Postgres) — evita migration toda vez que um status novo for adicionado; mesma filosofia simples do schema atual.

Migration: `npx prisma migrate dev --name add_service_order`.

### `ServiceOrderRepository`

`src/modules/service-order/repositories/service-order.repository.ts` — mesmo padrão de `ClientRepository`: `create`, `findById`, `findAll` (ordenado por `createdAt desc`), `update`, com `toPersistence`/`toDomain` privados desembrulhando/reconstruindo o enum e `cancellationReason`.

## Casos de uso (`ServiceOrderService`)

`src/modules/service-order/services/service-order.service.ts`, injeta `ServiceOrderRepository` e `ClientRepository`:

- `openServiceOrder(dto)` — valida `clientId` existe (`NotFoundException` senão), monta `ServiceOrder.create`, persiste.
- `findById(id)` — `NotFoundException` se não achar.
- `findAll()` — delega ao repositório.
- `startDiagnosis(id)`, `awaitApproval(id)`, `awaitParts(id)`, `startProgress(id)`, `complete(id)` — busca por id (404 senão), chama método correspondente da entity (propaga `DomainException` se transição inválida), persiste via `update`.
- `cancel(id, reason)` — busca por id (404 senão), chama `cancel(reason)`, persiste.

## HTTP

### DTOs

`src/modules/service-order/dto/service-order.dto.ts`

- `OpenServiceOrderDto`: `clientId` (uuid, `@IsUUID`), `vehicleId` (string, `@IsNotEmpty`), `description` (string, `@IsNotEmpty`).
- `CancelServiceOrderDto`: `reason` (string, `@IsNotEmpty`).
- `ServiceOrderResponseDto`: todos os campos desembrulhados, `status` como string, `cancellationReason` (nullable).

### Controller

`src/modules/service-order/controllers/service-order.controller.ts`, rota `/service-order`:

```
POST   /service-order                     → openServiceOrder
GET    /service-order                     → findAll
GET    /service-order/:id                 → findById
PATCH  /service-order/:id/start-diagnosis
PATCH  /service-order/:id/await-approval
PATCH  /service-order/:id/await-parts
PATCH  /service-order/:id/start-progress
PATCH  /service-order/:id/complete
PATCH  /service-order/:id/cancel          (body: CancelServiceOrderDto)
```

Swagger decorators iguais ao `ClientController` (`@ApiOperation`, `@ApiOkResponse`/`@ApiCreatedResponse`, `@ApiNotFoundResponse`, `@ApiBadRequestResponse` para transição/validação inválida).

### Mapper

`src/modules/service-order/mappers/service-order.mapper.ts` — mesmo padrão de `ClientMapper`.

### Module

`src/modules/service-order/service-order.module.ts` — registra controller/service/repository; importa `ClientModule` (para `ClientRepository`); exporta `ServiceOrderService`. Registrado em `app.module.ts`.

## Tratamento de erros

Igual ao restante do código: `DomainException` (regra de domínio — status inválido, campo obrigatório vazio) mapeada para 400 pelo `DomainExceptionFilter` já existente; `NotFoundException`/`ConflictException` do Nest para regras de aplicação (OS não encontrada).

## Testes

Espelhando `src/modules/client`:

- `entities/service-order.entity.spec.ts` — `create` (válido, campos obrigatórios), cada transição válida, cada transição inválida (`it.each` cobrindo toda a tabela), `cancel` sem motivo, imutabilidade de campos incorretos.
- `repositories/service-order.repository.spec.ts` — mock do Prisma; `toPersistence`/`toDomain`.
- `services/service-order.service.spec.ts` — mock de `ServiceOrderRepository` + `ClientRepository`; cada caso de uso, 404s, propagação de `DomainException`.
- `controllers/service-order.controller.spec.ts` — mock do service.
- `test/in-memory-service-order.repository.ts` + `test/service-order.e2e-spec.ts` — pipeline HTTP completo (precisa de um cliente existente via `InMemoryClientRepository` para os testes de `openServiceOrder`).
