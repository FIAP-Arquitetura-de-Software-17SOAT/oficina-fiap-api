# ServiceOrder: status "Entregue" + tempo médio de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two gaps found when comparing the already-shipped `ServiceOrder` module (`src/modules/service-order`) against the Tech Challenge PDF requirements:

1. The PDF's status list ends in **Entregue** (delivered); the shipped enum stops at `COMPLETED` (Finalizada). Add a `DELIVERED` terminal status reachable only from `COMPLETED`.
2. The PDF requires "Monitoramento do tempo médio de execução dos serviços"; nothing computes this today. Add a `completedAt` timestamp (set when an order transitions to `COMPLETED`) and a read-only metrics endpoint averaging `completedAt - createdAt` across finalized orders.

**Architecture:** Both changes extend the existing `ServiceOrder` module in place — no new module, no new files beyond one DTO addition and one migration. Every task mirrors patterns already in the codebase (`ALLOWED_TRANSITIONS` table, `describe.each` test blocks, `toPersistence`/`toDomain` mapping).

## Global Constraints

- Same conventions as the original ServiceOrder plan (`docs/superpowers/plans/2026-08-17-service-order.md`): English identifiers, Portuguese domain-rule messages, `DomainException` only thrown from the entity, `NotFoundException` for application-level not-found, global prefix `api/v1` (never added in `@Controller()`), DTOs use `@Transform(trim)` on every string field.
- Jest coverage threshold is global 80% (branches/functions/lines/statements); `.module.ts`/`.dto.ts` excluded from coverage.
- Every task ends with a commit (`type: short description`).
- **Design decision — execution-time metric:** measured as `completedAt - createdAt`, i.e. from opening the OS to it reaching `COMPLETED` (Finalizada) — *not* the later, optional `DELIVERED` transition, since delivery logistics (when the client picks up the vehicle) is a different concern from service execution time. `completedAt` is a new nullable timestamp set once, the first time an order transitions to `COMPLETED`; it is never touched by `deliver()`. This needed a schema field because the existing `updatedAt` keeps advancing on every later transition (including `deliver()`), which would silently corrupt the metric once delivery tracking exists.
- **Design decision — route placement:** the new `GET /service-order/metrics/average-execution-time` endpoint has two path segments after `/service-order/`, so it cannot collide with the single-segment `GET /service-order/:id` route regardless of declaration order (Express/Nest's `:id` only captures one segment). Place it in the controller between `findAll()` and `findById()` for readability, not because ordering is load-bearing here — but do not rename it to a single-segment path (e.g. `/service-order/metrics`) without re-checking this.
- **No auth added.** JWT/administrative auth is a separate, project-wide gap (not scoped to `ServiceOrder`) and out of scope for this plan.

---

### Task 1: `DELIVERED` status + `deliver()` transition

**Files:**
- Modify: `src/modules/service-order/enums/service-order-status.enum.ts`
- Modify: `src/modules/service-order/entities/service-order.entity.ts`
- Modify: `src/modules/service-order/entities/service-order.entity.spec.ts`
- Modify: `src/modules/service-order/services/service-order.service.ts`
- Modify: `src/modules/service-order/services/service-order.service.spec.ts`
- Modify: `src/modules/service-order/controllers/service-order.controller.ts`
- Modify: `src/modules/service-order/controllers/service-order.controller.spec.ts`
- Modify: `src/modules/service-order/dto/service-order.dto.ts`
- Modify: `test/service-order.e2e-spec.ts`

**Interfaces:**
- Produces: `ServiceOrderStatus.DELIVERED`; `ServiceOrder#deliver(): void` (only valid from `COMPLETED`, terminal — no further transitions, not cancellable); `ServiceOrderService#deliver(id: string): Promise<ServiceOrder>`; `PATCH /service-order/:id/deliver`.
- Consumes: existing `ALLOWED_TRANSITIONS` table, `transitionTo` (Task 1 of the original plan), existing `describe.each`/`it.each` test scaffolding in every layer.

- [ ] **Step 1: Add the enum value**

In `src/modules/service-order/enums/service-order-status.enum.ts`, add `DELIVERED` right after `COMPLETED`:

```ts
export enum ServiceOrderStatus {
  RECEIVED = 'RECEIVED',
  IN_DIAGNOSIS = 'IN_DIAGNOSIS',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  AWAITING_PARTS = 'AWAITING_PARTS',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}
```

- [ ] **Step 2: Extend the failing tests first**

In `src/modules/service-order/entities/service-order.entity.spec.ts`:

1. In the "permite transição válida" `it.each` array (currently ending with the `IN_PROGRESS → complete() → COMPLETED` tuple), add one more tuple:

```ts
      [
        ServiceOrderStatus.COMPLETED,
        (os: ServiceOrder) => os.deliver(),
        ServiceOrderStatus.DELIVERED,
      ],
```

2. In the "recusa transição inválida" `it.each` array, add these tuples (terminal-state and premature-delivery checks):

```ts
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.deliver()],
      [ServiceOrderStatus.IN_PROGRESS, (os: ServiceOrder) => os.deliver()],
      [ServiceOrderStatus.DELIVERED, (os: ServiceOrder) => os.startDiagnosis()],
      [ServiceOrderStatus.DELIVERED, (os: ServiceOrder) => os.cancel('motivo')],
```

3. Add one more standalone test right after `'cancel() recusa a partir de estado terminal'` (which checks `COMPLETED`):

```ts
    it('cancel() recusa a partir de DELIVERED', () => {
      const os = restoredAt(ServiceOrderStatus.DELIVERED);

      expect(() => os.cancel('motivo')).toThrow(DomainException);
    });
```

Run: `npx jest service-order.entity.spec.ts`
Expected: FAIL — `os.deliver is not a function`.

- [ ] **Step 3: Implement the transition**

In `src/modules/service-order/entities/service-order.entity.ts`:

1. Update `ALLOWED_TRANSITIONS` — change `[ServiceOrderStatus.COMPLETED]: [],` to:

```ts
  [ServiceOrderStatus.COMPLETED]: [ServiceOrderStatus.DELIVERED],
```

and add a new terminal entry right after it:

```ts
  [ServiceOrderStatus.DELIVERED]: [],
```

2. Add a `deliver()` method right after `complete()`:

```ts
  deliver(): void {
    this.transitionTo(ServiceOrderStatus.DELIVERED);
  }
```

Run: `npx jest service-order.entity.spec.ts`
Expected: PASS (all tests green).

- [ ] **Step 4: Extend the service (test first, then implementation)**

In `src/modules/service-order/services/service-order.service.spec.ts`, add one tuple to the `describe.each` array (right after the `'complete'` tuple):

```ts
    [
      'deliver',
      ServiceOrderStatus.COMPLETED,
      ServiceOrderStatus.DELIVERED,
    ],
```

This reuses the block's three existing generic tests (successful transition + persist, `NotFound` when the order doesn't exist, `DomainException` on an invalid transition from `CANCELLED`) — no new test bodies needed.

Run: `npx jest service-order.service.spec.ts`
Expected: FAIL — `service.deliver is not a function` (TypeScript will actually fail to compile `service[method]` first; that's expected).

In `src/modules/service-order/services/service-order.service.ts`, add right after `complete()`:

```ts
  async deliver(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.deliver();

    return this.serviceOrderRepository.update(serviceOrder);
  }
```

Run: `npx jest service-order.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Extend the controller (test first, then implementation)**

In `src/modules/service-order/controllers/service-order.controller.spec.ts`:

1. Add `deliver: jest.fn(),` to the `service` mock object (right after `complete: jest.fn(),`).
2. Add `['deliver', 'deliver']` to the `it.each` array (right after `['complete', 'complete']`).

Run: `npx jest service-order.controller.spec.ts`
Expected: FAIL — `controller.deliver is not a function`.

In `src/modules/service-order/controllers/service-order.controller.ts`, add right after the `complete()` handler and before `cancel()`:

```ts
  @Patch(':id/deliver')
  @ApiOperation({ summary: 'Marca a OS como entregue ao cliente' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async deliver(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.deliver(id),
    );
  }
```

Run: `npx jest service-order.controller.spec.ts`
Expected: PASS.

- [ ] **Step 6: Update the response DTO's documented enum**

In `src/modules/service-order/dto/service-order.dto.ts`, in `ServiceOrderResponseDto.status`'s `@ApiProperty({ enum: [...] })`, add `'DELIVERED'` right after `'COMPLETED'`:

```ts
  @ApiProperty({
    enum: [
      'RECEIVED',
      'IN_DIAGNOSIS',
      'AWAITING_APPROVAL',
      'AWAITING_PARTS',
      'IN_PROGRESS',
      'COMPLETED',
      'DELIVERED',
      'CANCELLED',
    ],
  })
  status: string;
```

- [ ] **Step 7: Extend e2e coverage**

In `test/service-order.e2e-spec.ts`, inside `describe('fluxo de transição de status', ...)`:

1. Extend the existing happy-path test to also deliver, renaming it to reflect the new final state:

```ts
    it('percorre o fluxo feliz até DELIVERED', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'start-diagnosis').expect(200);
      await advance(created.id, 'await-approval').expect(200);
      await advance(created.id, 'start-progress').expect(200);
      await advance(created.id, 'complete').expect(200);
      const response = await advance(created.id, 'deliver').expect(200);

      expect(response.body.status).toBe('DELIVERED');
    });
```

(This replaces the prior `'percorre o fluxo feliz até COMPLETED'` test — same setup, two extra lines.)

2. Add a new test right after it:

```ts
    it('devolve 400 ao entregar OS que ainda não foi finalizada', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'deliver').expect(400);
    });
```

Run: `npx jest --config ./test/jest-e2e.json service-order.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 8: Full verification + commit**

Run: `npx jest` (unit) and `npx jest --config ./test/jest-e2e.json` (e2e) — both green. Run `npx tsc --noEmit` — clean.

```bash
git add src/modules/service-order/enums/service-order-status.enum.ts \
        src/modules/service-order/entities/service-order.entity.ts \
        src/modules/service-order/entities/service-order.entity.spec.ts \
        src/modules/service-order/services/service-order.service.ts \
        src/modules/service-order/services/service-order.service.spec.ts \
        src/modules/service-order/controllers/service-order.controller.ts \
        src/modules/service-order/controllers/service-order.controller.spec.ts \
        src/modules/service-order/dto/service-order.dto.ts \
        test/service-order.e2e-spec.ts
git commit -m "feat: add DELIVERED status to ServiceOrder"
```

---

### Task 2: `completedAt` persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: (generated) `prisma/migrations/<timestamp>_add_service_order_completed_at/migration.sql`
- Modify: `src/modules/service-order/entities/service-order.entity.ts`
- Modify: `src/modules/service-order/entities/service-order.entity.spec.ts`
- Modify: `src/modules/service-order/repositories/service-order.repository.ts`
- Modify: `src/modules/service-order/repositories/service-order.repository.spec.ts`

**Interfaces:**
- Produces: `ServiceOrder#getCompletedAt(): Date | null` (set once, the first time `complete()` succeeds); Prisma column `service_order.completedAt` (nullable). Consumed by Task 3's metrics calculation.
- Consumes: Task 1's `ServiceOrder` (this task builds directly on top of Task 1's file state).

- [ ] **Step 1: Add the schema field**

In `prisma/schema.prisma`, add `completedAt DateTime?` to the `ServiceOrder` model, right after `cancellationReason String?`:

```prisma
model ServiceOrder {
  id                 String    @id
  clientId           String
  vehicleId          String
  description        String
  status             String
  cancellationReason String?
  completedAt        DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  client Client @relation(fields: [clientId], references: [id], onDelete: Restrict)

  @@index([clientId])
  @@map("service_order")
}
```

- [ ] **Step 2: Ensure the local database is available**

Same as the original plan's Task 2: `.env` from `.env.sample` if missing, `docker compose up -d db`, wait for healthy (`docker compose ps`).

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_service_order_completed_at`
Expected: additive-only `ALTER TABLE "service_order" ADD COLUMN "completedAt" TIMESTAMP(3);` — nothing destructive, no other tables touched. Regenerates the Prisma client.

- [ ] **Step 4: Extend the failing entity tests first**

In `src/modules/service-order/entities/service-order.entity.spec.ts`:

1. Add to the `create` describe block:

```ts
    it('não tem data de finalização ao criar', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getCompletedAt()).toBeNull();
    });
```

2. Add to the `transições de status` describe block, right after the "permite transição válida" `it.each` test:

```ts
    it('complete() define completedAt', () => {
      const os = restoredAt(ServiceOrderStatus.IN_PROGRESS);

      os.complete();

      expect(os.getCompletedAt()).toBeInstanceOf(Date);
    });
```

3. Add to the `restore` describe block:

```ts
    it('preserva completedAt vindo do banco', () => {
      const completedAt = new Date('2026-03-01T10:00:00.000Z');

      const os = ServiceOrder.restore(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        validProps({ status: ServiceOrderStatus.COMPLETED, completedAt }),
      );

      expect(os.getCompletedAt()).toBe(completedAt);
    });
```

Run: `npx jest service-order.entity.spec.ts`
Expected: FAIL — `os.getCompletedAt is not a function` / `completedAt` not assignable to `ServiceOrderProps`.

- [ ] **Step 5: Implement `completedAt` on the entity**

In `src/modules/service-order/entities/service-order.entity.ts`:

1. Add `completedAt?: Date | null;` to `ServiceOrderProps`, right after `cancellationReason?: string | null;`.
2. Add a private field `private completedAt: Date | null;` right after `private cancellationReason: string | null;`.
3. In the constructor, set it right after `this.cancellationReason = props.cancellationReason ?? null;`:

```ts
    this.completedAt = props.completedAt ?? null;
```

4. Add a getter right after `getCancellationReason()`:

```ts
  getCompletedAt(): Date | null {
    return this.completedAt;
  }
```

5. Update `complete()` to also set it:

```ts
  complete(): void {
    this.transitionTo(ServiceOrderStatus.COMPLETED);
    this.completedAt = new Date();
  }
```

Run: `npx jest service-order.entity.spec.ts`
Expected: PASS.

- [ ] **Step 6: Extend the failing repository tests first**

In `src/modules/service-order/repositories/service-order.repository.spec.ts`:

1. Add `completedAt: null as Date | null,` to the `row` fixture, right after `cancellationReason: null as string | null,`.
2. Update the `'update envia apenas status, motivo de cancelamento e updatedAt'` test — rename it and extend the expected payload:

```ts
  it('update envia status, motivo de cancelamento, completedAt e updatedAt', async () => {
    const cancelledRow = {
      ...row,
      status: 'CANCELLED',
      cancellationReason: 'Cliente desistiu',
    };
    prisma.serviceOrder.update.mockResolvedValue(cancelledRow);

    const serviceOrder = ServiceOrder.restore(row.id, {
      clientId: row.clientId,
      vehicleId: row.vehicleId,
      description: row.description,
      status: ServiceOrderStatus.RECEIVED,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    serviceOrder.cancel('Cliente desistiu');

    await repository.update(serviceOrder);

    const call = prisma.serviceOrder.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: row.id });
    expect(call.data).toEqual({
      status: 'CANCELLED',
      cancellationReason: 'Cliente desistiu',
      completedAt: null,
      updatedAt: serviceOrder.getUpdatedAt(),
    });
  });

  it('update envia completedAt quando a OS é finalizada', async () => {
    const completedRow = { ...row, status: 'COMPLETED', completedAt: new Date() };
    prisma.serviceOrder.update.mockResolvedValue(completedRow);

    const serviceOrder = ServiceOrder.restore(row.id, {
      clientId: row.clientId,
      vehicleId: row.vehicleId,
      description: row.description,
      status: ServiceOrderStatus.IN_PROGRESS,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    serviceOrder.complete();

    await repository.update(serviceOrder);

    const call = prisma.serviceOrder.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });
```

3. Also add `completedAt: row.completedAt,` to the `'reconstrói a entidade a partir da linha do banco'` test's assertions if useful — not required, the two tests above already cover it end to end.

Run: `npx jest service-order.repository.spec.ts`
Expected: FAIL (payload shape mismatch / missing field on `ServiceOrderRow`).

- [ ] **Step 7: Implement `completedAt` on the repository**

In `src/modules/service-order/repositories/service-order.repository.ts`:

1. Add `completedAt: Date | null;` to `ServiceOrderRow`, right after `cancellationReason: string | null;`.
2. In `toPersistence`, add `completedAt: serviceOrder.getCompletedAt(),` right after `cancellationReason: serviceOrder.getCancellationReason(),`.
3. In `toDomain`, add `completedAt: row.completedAt,` right after `cancellationReason: row.cancellationReason,`.
4. In `update()`'s `data` object, add `completedAt: serviceOrder.getCompletedAt(),` right after `cancellationReason: serviceOrder.getCancellationReason(),`.

Run: `npx jest service-order.repository.spec.ts`
Expected: PASS.

- [ ] **Step 8: Full verification + commit**

Run: `npx jest` and `npx tsc --noEmit` — both clean.

```bash
git add prisma/schema.prisma prisma/migrations \
        src/modules/service-order/entities/service-order.entity.ts \
        src/modules/service-order/entities/service-order.entity.spec.ts \
        src/modules/service-order/repositories/service-order.repository.ts \
        src/modules/service-order/repositories/service-order.repository.spec.ts
git commit -m "feat: track completedAt on ServiceOrder"
```

---

### Task 3: Average execution time metrics endpoint

**Files:**
- Modify: `src/modules/service-order/dto/service-order.dto.ts`
- Modify: `src/modules/service-order/services/service-order.service.ts`
- Modify: `src/modules/service-order/services/service-order.service.spec.ts`
- Modify: `src/modules/service-order/controllers/service-order.controller.ts`
- Modify: `src/modules/service-order/controllers/service-order.controller.spec.ts`
- Modify: `test/service-order.e2e-spec.ts`
- Modify: `test/swagger.e2e-spec.ts`

**Interfaces:**
- Consumes: `ServiceOrder#getCompletedAt()`/`getCreatedAt()` (Task 2), `ServiceOrderRepository#findAll()` (existing).
- Produces: `AverageExecutionTimeResponseDto { averageExecutionTimeMs: number | null; sampleSize: number }`; `ServiceOrderService#getAverageExecutionTime(): Promise<{ averageExecutionTimeMs: number | null; sampleSize: number }>`; `GET /service-order/metrics/average-execution-time`.

- [ ] **Step 1: Add the response DTO**

In `src/modules/service-order/dto/service-order.dto.ts`, add at the end of the file:

```ts
export class AverageExecutionTimeResponseDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Tempo médio de execução em milissegundos (createdAt até completedAt) das OS finalizadas. Null se nenhuma OS foi finalizada ainda.',
  })
  averageExecutionTimeMs: number | null;

  @ApiProperty({
    description: 'Quantidade de OS finalizadas consideradas no cálculo',
  })
  sampleSize: number;
}
```

- [ ] **Step 2: Write the failing service test**

In `src/modules/service-order/services/service-order.service.spec.ts`, add a new top-level `describe` block, right after the `describe('findAll', ...)` block:

```ts
  describe('getAverageExecutionTime', () => {
    it('retorna null e amostra 0 quando não há OS finalizada', async () => {
      repository.findAll.mockResolvedValue([
        makeServiceOrder(ServiceOrderStatus.RECEIVED),
        makeServiceOrder(ServiceOrderStatus.IN_PROGRESS),
      ]);

      await expect(service.getAverageExecutionTime()).resolves.toEqual({
        averageExecutionTimeMs: null,
        sampleSize: 0,
      });
    });

    it('calcula a média entre createdAt e completedAt das OS finalizadas', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const completedFast = ServiceOrder.restore('a', {
        clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        description: 'x',
        status: ServiceOrderStatus.COMPLETED,
        createdAt,
        completedAt: new Date('2026-01-01T01:00:00.000Z'), // 1h
      });
      const completedSlow = ServiceOrder.restore('b', {
        clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        description: 'x',
        status: ServiceOrderStatus.DELIVERED,
        createdAt,
        completedAt: new Date('2026-01-01T03:00:00.000Z'), // 3h
      });
      const notCompleted = makeServiceOrder(ServiceOrderStatus.IN_PROGRESS);
      repository.findAll.mockResolvedValue([
        completedFast,
        completedSlow,
        notCompleted,
      ]);

      const result = await service.getAverageExecutionTime();

      expect(result.sampleSize).toBe(2);
      expect(result.averageExecutionTimeMs).toBe(2 * 60 * 60 * 1000); // média de 1h e 3h
    });
  });
```

Run: `npx jest service-order.service.spec.ts`
Expected: FAIL — `service.getAverageExecutionTime is not a function`.

- [ ] **Step 3: Implement the service method**

In `src/modules/service-order/services/service-order.service.ts`, add at the end of the class:

```ts
  async getAverageExecutionTime(): Promise<{
    averageExecutionTimeMs: number | null;
    sampleSize: number;
  }> {
    const serviceOrders = await this.serviceOrderRepository.findAll();
    const completed = serviceOrders.filter(
      (serviceOrder) => serviceOrder.getCompletedAt() !== null,
    );

    if (completed.length === 0) {
      return { averageExecutionTimeMs: null, sampleSize: 0 };
    }

    const totalMs = completed.reduce(
      (sum, serviceOrder) =>
        sum +
        (serviceOrder.getCompletedAt()!.getTime() -
          serviceOrder.getCreatedAt().getTime()),
      0,
    );

    return {
      averageExecutionTimeMs: Math.round(totalMs / completed.length),
      sampleSize: completed.length,
    };
  }
```

Run: `npx jest service-order.service.spec.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing controller test**

In `src/modules/service-order/controllers/service-order.controller.spec.ts`:

1. Add `getAverageExecutionTime: jest.fn(),` to the `service` mock object.
2. Add a new test right after `'findAll mapeia a lista inteira'`:

```ts
  it('getAverageExecutionTime repassa o resultado do service', async () => {
    service.getAverageExecutionTime.mockResolvedValue({
      averageExecutionTimeMs: 3600000,
      sampleSize: 2,
    });

    const response = await controller.getAverageExecutionTime();

    expect(response).toEqual({ averageExecutionTimeMs: 3600000, sampleSize: 2 });
  });
```

Run: `npx jest service-order.controller.spec.ts`
Expected: FAIL — `controller.getAverageExecutionTime is not a function`.

- [ ] **Step 5: Implement the controller endpoint**

In `src/modules/service-order/controllers/service-order.controller.ts`, import `AverageExecutionTimeResponseDto` from the DTO file, then add the handler between `findAll()` and `findById()`:

```ts
  @Get('metrics/average-execution-time')
  @ApiOperation({
    summary: 'Tempo médio de execução das ordens de serviço finalizadas',
  })
  @ApiOkResponse({ type: AverageExecutionTimeResponseDto })
  async getAverageExecutionTime(): Promise<AverageExecutionTimeResponseDto> {
    return this.serviceOrderService.getAverageExecutionTime();
  }
```

This is placed above `@Get(':id')` for readability; it's safe regardless of order because `metrics/average-execution-time` is two path segments and `:id` only ever captures one.

Run: `npx jest service-order.controller.spec.ts`
Expected: PASS.

- [ ] **Step 6: e2e coverage — prove the route doesn't collide with `:id`**

In `test/service-order.e2e-spec.ts`, add a new `describe` block right after `describe('GET /api/v1/service-order', ...)`:

```ts
  describe('GET /api/v1/service-order/metrics/average-execution-time', () => {
    it('devolve null e amostra 0 sem OS finalizada', async () => {
      const response = await request(http)
        .get('/api/v1/service-order/metrics/average-execution-time')
        .expect(200);

      expect(response.body).toEqual({
        averageExecutionTimeMs: null,
        sampleSize: 0,
      });
    });

    it('calcula a média após finalizar uma OS', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'start-diagnosis').expect(200);
      await advance(created.id, 'await-approval').expect(200);
      await advance(created.id, 'start-progress').expect(200);
      await advance(created.id, 'complete').expect(200);

      const response = await request(http)
        .get('/api/v1/service-order/metrics/average-execution-time')
        .expect(200);

      expect(response.body.sampleSize).toBe(1);
      expect(response.body.averageExecutionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
```

Note: `advance` is defined inside `describe('fluxo de transição de status', ...)` in the current file — move its definition (the `const advance = (...) => ...` arrow function) up to the top of the outer `describe('ServiceOrder (integração)', ...)` block, right next to `const open = (...)`, so both `describe` blocks can use it. This is a pure relocation, no behavior change.

Run: `npx jest --config ./test/jest-e2e.json service-order.e2e-spec.ts`
Expected: PASS — in particular, the first test proves `metrics/average-execution-time` is NOT swallowed by the `:id` route (it would otherwise 400 from `ParseUUIDPipe` rejecting `"metrics"` as a UUID... except the route has two segments, so this test is really guarding against a future accidental single-segment rename, not today's routing — assert it passes regardless).

- [ ] **Step 7: Extend the Swagger contract guard**

In `test/swagger.e2e-spec.ts`:

1. Add `'/api/v1/service-order/metrics/average-execution-time'` to the `expect.arrayContaining([...])` list in `'documenta as rotas de ordem de serviço sob o prefixo da API'`.
2. Add a check for its verb, right after the existing `for (const action of [...])` loop in `'documenta todos os verbos das rotas de ordem de serviço'`:

```ts
    expect(
      Object.keys(
        document.paths['/api/v1/service-order/metrics/average-execution-time'],
      ),
    ).toEqual(expect.arrayContaining(['get']));
```

3. Add `'AverageExecutionTimeResponseDto'` to the `expect.arrayContaining([...])` list in `'expõe os schemas de request e response da ordem de serviço'`.

Run: `npx jest --config ./test/jest-e2e.json swagger.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 8: Full verification + commit**

Run: `npx jest`, `npx jest --config ./test/jest-e2e.json`, `npx tsc --noEmit`, `npx eslint "{src,test}/**/*.ts"` — all clean.

```bash
git add src/modules/service-order/dto/service-order.dto.ts \
        src/modules/service-order/services/service-order.service.ts \
        src/modules/service-order/services/service-order.service.spec.ts \
        src/modules/service-order/controllers/service-order.controller.ts \
        src/modules/service-order/controllers/service-order.controller.spec.ts \
        test/service-order.e2e-spec.ts \
        test/swagger.e2e-spec.ts
git commit -m "feat: add average execution time metrics endpoint"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 closes the "Entregue" status gap; Tasks 2+3 close the "tempo médio de execução" gap. Both were the two non-deliberately-excluded gaps identified against the Tech Challenge PDF for the `ServiceOrder` epic specifically (Vehicle/Diagnóstico/Orçamento/Estoque/Pagamento remain out of scope per the original design spec).
- **Type consistency:** `ServiceOrder#getCompletedAt()`, `ServiceOrderProps.completedAt`, and the repository's `ServiceOrderRow.completedAt` all agree (`Date | null`); the metrics DTO and the service's return type agree (`{ averageExecutionTimeMs: number | null; sampleSize: number }`).
- **Scope:** no new module, no auth, no per-status timestamp beyond `completedAt` (delivery time is intentionally not tracked — `deliver()` only touches `updatedAt` via the existing `touch()` in `transitionTo`).
