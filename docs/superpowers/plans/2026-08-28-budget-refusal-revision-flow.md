# Budget Refusal MVP Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the educational MVP refusal flow so a customer refusal records an explicit `BUDGET_REFUSED` budget state and cancels the service order, while preventing new budgets from being created for cancelled service orders.

**Architecture:** Keep Budget as the owner of proposal state and ServiceOrder as the owner of workshop execution state. The budget refusal endpoint will transition the budget from `WAITING_APPROVAL` to `BUDGET_REFUSED`, then cancel the related OS through the existing ServiceOrderController integration. Budget creation must validate the OS state before persistence so a cancelled OS cannot receive a new budget version.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, Jest, Supertest, class-validator, Swagger.

**Spec:** User decision from 2026-08-28: for MVP/educational scope, refusal is terminal for the service order; do not implement budget revision/reopen flow yet.

## Global Constraints

- Follow existing module shape: `entities`, `dto`, `mappers`, `repositories`, `services`, `controllers`.
- Controllers stay thin; services orchestrate use cases; entities own state transitions.
- Cross-module integration should go through controllers, matching the current Budget -> ServiceOrder pattern.
- Do not accept calculated totals from request bodies.
- Follow TDD: write each failing test first, run it red, implement the minimal change, run it green.
- Keep implementation scoped to the MVP refusal flow. Do not implement reopening, revision actions, or editing refused budgets.

---

## Current Flow Map

### Happy path that works today

1. `POST /api/v1/service-order` creates OS as `RECEIVED`.
2. `PATCH /api/v1/service-order/:id/assign` moves OS to `IN_DIAGNOSIS`.
3. `POST /api/v1/budgets` creates budget version 1 as `GENERATED`.
4. `BudgetService.create()` calls `serviceOrderController.awaitApproval()` only when the budget version is `1`.
5. OS moves `IN_DIAGNOSIS -> AWAITING_APPROVAL`.
6. `POST /api/v1/budgets/:id/send` moves budget `GENERATED -> WAITING_APPROVAL`.
7. `POST /api/v1/budgets/:id/accept` moves budget `WAITING_APPROVAL -> ACCEPTED`.
8. Budget acceptance calls `serviceOrderController.awaitParts()`.
9. OS moves `AWAITING_APPROVAL -> AWAITING_PARTS`.
10. Stock dispatch moves OS to `IN_PROGRESS`, then service completion moves it to `COMPLETED`.

### Refusal path today

1. `POST /api/v1/budgets/:id/refuse` marks the budget as `REFUSED`.
2. `BudgetService.refuse()` calls `serviceOrderController.cancel(...)`.
3. OS moves `AWAITING_APPROVAL -> CANCELLED`.
4. The refused budget cannot be edited, resent, accepted, or refused again.
5. Problem: `BudgetService.create()` does not validate OS status before saving, so a new budget can still be persisted for the same cancelled OS. That is the part this plan fixes.

### MVP target flow

1. Customer refuses a sent budget.
2. Budget moves `WAITING_APPROVAL -> BUDGET_REFUSED`.
3. Budget stores `refusalReason` and `answeredAt`.
4. OS moves `AWAITING_APPROVAL -> CANCELLED`.
5. Any attempt to create a new budget for that cancelled OS returns `409 Conflict` before persistence.

### Additional issue found while validating

`GET /api/v1/budgets?serviceOrderId=...` is used by `test/budget.persistence.e2e-spec.ts`, but `BudgetController.findAll()` currently ignores query params and returns all budgets. That test passes accidentally when there is only one budget. The explicit route `GET /api/v1/budgets/service-order/:serviceOrderId` works. For MVP scope, either remove the query usage from tests or implement the filter. This plan implements the filter because it matches existing API usage.

## Target Rules

1. Budget refusal is terminal for the proposal and for the OS in this MVP.
2. Budget status should be `BUDGET_REFUSED`, not generic `REFUSED`, so the API makes clear that the refusal came from the budget/customer decision.
3. A `BUDGET_REFUSED` budget remains immutable.
4. `BudgetService.refuse()` keeps the existing OS cancellation side effect.
5. Creating a budget is allowed only when the OS is `IN_DIAGNOSIS` for the first proposal.
6. Creating an additional budget while OS is `IN_PROGRESS` remains allowed only if current tests/product scope require additional repair budgets; otherwise reject it in the same status guard. Preserve existing tests unless a product decision says to remove additional repair budgets.
7. Creating a budget must be rejected before persistence for `RECEIVED`, `AWAITING_APPROVAL`, `AWAITING_PARTS`, `COMPLETED`, `DELIVERED`, and `CANCELLED`.
8. Do not implement "modify refused budget and resend". A future revision flow should create a separate plan if the MVP grows.

---

### Task 1: Rename Refused Budget Status To BUDGET_REFUSED

**Files:**
- Modify: `src/modules/budget/entities/budget.entity.ts`
- Modify: `src/modules/budget/dto/budget.dto.ts`
- Modify: `src/modules/budget/repositories/budget.repository.ts`
- Modify: `src/modules/budget/mappers/budget.mapper.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_rename_budget_refused_status/migration.sql`
- Test: `src/modules/budget/entities/budget.entity.spec.ts`
- Test: `src/modules/budget/services/budget.service.spec.ts`
- Test: `test/budget.e2e-spec.ts`
- Test: `test/workshop-flow.e2e-spec.ts`
- Test: `test/budget.persistence.e2e-spec.ts`

**Interfaces:**
- Produces: `BudgetStatus.BUDGET_REFUSED = 'BUDGET_REFUSED'`
- Replaces: `BudgetStatus.REFUSED`
- Keeps: `Budget.refuse(reason: string): void`

- [ ] **Step 1: Write failing entity tests**

In `src/modules/budget/entities/budget.entity.spec.ts`, update refusal expectations from `BudgetStatus.REFUSED` to `BudgetStatus.BUDGET_REFUSED`:

```ts
expect(budget.getStatus()).toBe(BudgetStatus.BUDGET_REFUSED);
```

Update the terminal budget test so the refused fixture is created by `refuse(...)` and still rejects `accept`, `refuse`, `sendToCustomer`, `addItem`, and `removeItem`.

- [ ] **Step 2: Write failing service/e2e expectations**

Update refusal response expectations in:

```text
src/modules/budget/services/budget.service.spec.ts
test/budget.e2e-spec.ts
test/workshop-flow.e2e-spec.ts
test/budget.persistence.e2e-spec.ts
```

Expected response status:

```ts
expect(body.status).toBe('BUDGET_REFUSED');
```

- [ ] **Step 3: Run red**

```bash
npm test -- budget.entity.spec.ts budget.service.spec.ts --runInBand
npm run test:e2e -- budget.e2e-spec.ts workshop-flow.e2e-spec.ts budget.persistence.e2e-spec.ts --runInBand
```

Expected: fail because production still returns `REFUSED`.

- [ ] **Step 4: Update domain enum and Prisma enum**

In `src/modules/budget/entities/budget.entity.ts`:

```ts
export enum BudgetStatus {
  GENERATED = 'GENERATED',
  WAITING_APPROVAL = 'WAITING_APPROVAL',
  ACCEPTED = 'ACCEPTED',
  BUDGET_REFUSED = 'BUDGET_REFUSED',
}
```

In `Budget.refuse(...)`, set:

```ts
this.status = BudgetStatus.BUDGET_REFUSED;
```

In `prisma/schema.prisma`, update `enum BudgetStatus` from `REFUSED` to `BUDGET_REFUSED`.

- [ ] **Step 5: Add migration**

Create `prisma/migrations/<timestamp>_rename_budget_refused_status/migration.sql`:

```sql
ALTER TYPE "BudgetStatus" ADD VALUE IF NOT EXISTS 'BUDGET_REFUSED';

UPDATE "budget"
SET "status" = 'BUDGET_REFUSED'
WHERE "status"::text = 'REFUSED';
```

If PostgreSQL refuses removing enum values in-place, leave the old `REFUSED` value in the database enum for compatibility. Prisma schema should expose only `BUDGET_REFUSED`.

- [ ] **Step 6: Run green**

```bash
npm test -- budget.entity.spec.ts budget.service.spec.ts --runInBand
npm run test:e2e -- budget.e2e-spec.ts workshop-flow.e2e-spec.ts budget.persistence.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/budget prisma test
git commit -m "fix: make customer budget refusal explicit"
```

---

### Task 2: Keep OS Cancellation As The MVP Refusal Side Effect

**Files:**
- Modify: `src/modules/budget/services/budget.service.ts`
- Test: `src/modules/budget/services/budget.service.spec.ts`
- Test: `test/workshop-flow.e2e-spec.ts`

**Interfaces:**
- Consumes: `ServiceOrderController.cancel(id: string, dto: { reason: string })`
- Keeps: `BudgetService.refuse(id, dto)` cancels the OS after budget refusal.

- [ ] **Step 1: Write/adjust failing tests**

In `src/modules/budget/services/budget.service.spec.ts`, keep the policy test explicit:

```ts
it('orcamento recusado cancela a ordem de servico no MVP', async () => {
  const budget = makeBudget();
  budget.sendToCustomer();
  repository.findById.mockResolvedValue(budget);

  const result = await service.refuse(budget.getId(), { reason: 'Achou caro' });

  expect(result.getStatus()).toBe(BudgetStatus.BUDGET_REFUSED);
  expect(serviceOrderController.cancel).toHaveBeenCalledWith('service-123', {
    reason: 'Orcamento recusado: Achou caro',
  });
});
```

In `test/workshop-flow.e2e-spec.ts`, keep the integrated behavior:

```ts
await request(http)
  .post(`/api/v1/budgets/${budget.body.id}/refuse`)
  .send({ reason: 'Achou caro' })
  .expect(200)
  .expect(({ body }) => {
    expect(body.status).toBe('BUDGET_REFUSED');
    expect(body.refusalReason).toBe('Achou caro');
  });

await request(http)
  .get(`/api/v1/service-order/${serviceOrderId}`)
  .expect(200)
  .expect(({ body }) => {
    expect(body.status).toBe('CANCELLED');
    expect(body.cancellationReason).toContain('Achou caro');
  });
```

- [ ] **Step 2: Run red**

```bash
npm test -- budget.service.spec.ts --runInBand
npm run test:e2e -- workshop-flow.e2e-spec.ts --runInBand
```

Expected: fail until Task 1 changes the budget status name.

- [ ] **Step 3: Keep implementation minimal**

In `BudgetService.refuse(...)`, keep the existing cancellation call:

```ts
await this.serviceOrderController.cancel(refused.getServiceOrderId(), {
  reason: `Orcamento recusado: ${refused.getRefusalReason()}`,
});
```

Update comments to state the MVP rule:

```ts
// MVP educativo: recusa do cliente encerra a OS. Um fluxo futuro de revisao
// deve criar nova regra/status de reabertura em outro plano.
```

- [ ] **Step 4: Run green**

```bash
npm test -- budget.service.spec.ts --runInBand
npm run test:e2e -- workshop-flow.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/budget/services/budget.service.ts src/modules/budget/services/budget.service.spec.ts test/workshop-flow.e2e-spec.ts
git commit -m "docs: clarify mvp budget refusal cancellation"
```

---

### Task 3: Reject New Budgets For Cancelled Service Orders Before Persistence

**Files:**
- Modify: `src/modules/budget/services/budget.service.ts`
- Test: `src/modules/budget/services/budget.service.spec.ts`
- Test: `test/workshop-flow.e2e-spec.ts`

**Interfaces:**
- Consumes: `ServiceOrderController.findById(id: string): Promise<ServiceOrderResponseDto>`
- Produces: `BudgetService.create()` validates OS status before `BudgetRepository.create(...)`.

- [ ] **Step 1: Write failing service tests**

Update the `serviceOrderController` mock in `src/modules/budget/services/budget.service.spec.ts` to include:

```ts
findById: jest.Mock;
```

Default setup:

```ts
serviceOrderController.findById.mockResolvedValue({
  id: 'service-123',
  status: 'IN_DIAGNOSIS',
  clientId: 'client-1',
});
```

Add:

```ts
it('recusa criar novo orcamento para OS cancelada antes de persistir', async () => {
  serviceOrderController.findById.mockResolvedValue({
    id: 'service-123',
    status: 'CANCELLED',
    clientId: 'client-1',
  });

  await expect(
    service.create({
      serviceOrderId: 'service-123',
      items: [
        {
          description: 'Revisao indevida',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 90,
        },
      ],
    }),
  ).rejects.toThrow(ConflictException);

  expect(repository.findLastVersionByServiceOrderId).not.toHaveBeenCalled();
  expect(repository.create).not.toHaveBeenCalled();
  expect(serviceOrderController.awaitApproval).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write failing integrated test**

In `test/workshop-flow.e2e-spec.ts`, extend the refusal test after asserting OS `CANCELLED`:

```ts
await request(http)
  .post('/api/v1/budgets')
  .send({
    serviceOrderId,
    items: [
      {
        partId,
        description: 'Filtro de oleo revisado',
        type: 'PART',
        quantity: 1,
        unitPrice: 120,
      },
    ],
  })
  .expect(409);

await request(http)
  .get(`/api/v1/budgets/service-order/${serviceOrderId}`)
  .expect(200)
  .expect(({ body }) => {
    expect(body).toHaveLength(1);
    expect(body[0].status).toBe('BUDGET_REFUSED');
  });
```

- [ ] **Step 3: Run red**

```bash
npm test -- budget.service.spec.ts --runInBand
npm run test:e2e -- workshop-flow.e2e-spec.ts --runInBand
```

Expected: fail because `BudgetService.create()` currently persists before checking OS status.

- [ ] **Step 4: Implement status guard**

In `BudgetService.create()`:

```ts
const serviceOrder = await this.serviceOrderController.findById(serviceOrderId);

if (!this.canCreateBudgetForServiceOrderStatus(serviceOrder.status)) {
  throw new ConflictException(
    `Cannot create budget for service order in status ${serviceOrder.status}`,
  );
}
```

Add helper:

```ts
private canCreateBudgetForServiceOrderStatus(status: string): boolean {
  return ['IN_DIAGNOSIS', 'IN_PROGRESS'].includes(status);
}
```

Keep existing version allocation after this guard. Preserve the existing behavior where version 1 moves OS to `AWAITING_APPROVAL`. If additional repair budgets in `IN_PROGRESS` are preserved, they should not call `awaitApproval()`.

- [ ] **Step 5: Run green**

```bash
npm test -- budget.service.spec.ts --runInBand
npm run test:e2e -- workshop-flow.e2e-spec.ts budget.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/budget/services/budget.service.ts src/modules/budget/services/budget.service.spec.ts test/workshop-flow.e2e-spec.ts
git commit -m "fix: reject budgets for cancelled service orders"
```

---

### Task 4: Make Budget Listing Query Match Existing API Usage

**Files:**
- Modify: `src/modules/budget/controllers/budget.controller.ts`
- Test: `test/budget.e2e-spec.ts`
- Test: `test/budget.persistence.e2e-spec.ts`

**Interfaces:**
- Changes: `GET /api/v1/budgets?serviceOrderId=<id>` filters by service order id.
- Keeps: `GET /api/v1/budgets/service-order/:serviceOrderId`.

- [ ] **Step 1: Write failing e2e test**

In `test/budget.e2e-spec.ts`, add:

```ts
it('filtra orcamentos por serviceOrderId via query string', async () => {
  const first = await createBudget();
  const otherServiceOrderId = await openServiceOrderAwaitingApproval();

  await request(http)
    .post('/api/v1/budgets')
    .send({
      serviceOrderId: otherServiceOrderId,
      items: [
        {
          description: 'Brake inspection',
          type: 'SERVICE',
          quantity: 1,
          unitPrice: 80,
        },
      ],
    })
    .expect(201);

  await request(http)
    .get(`/api/v1/budgets?serviceOrderId=${serviceOrderId}`)
    .expect(200)
    .expect(({ body }) => {
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(first.id);
      expect(body[0].serviceOrderId).toBe(serviceOrderId);
    });
});
```

- [ ] **Step 2: Run red**

```bash
npm run test:e2e -- budget.e2e-spec.ts budget.persistence.e2e-spec.ts --runInBand
```

Expected: fail because `BudgetController.findAll()` ignores `serviceOrderId`.

- [ ] **Step 3: Implement query filter**

In `BudgetController`, import `Query` and change `findAll`:

```ts
async findAll(
  @Query('serviceOrderId') serviceOrderId?: string,
): Promise<BudgetResponseDto[]> {
  const budgets = serviceOrderId?.trim()
    ? await this.budgetService.findByServiceOrderId(serviceOrderId)
    : await this.budgetService.findAll();

  return BudgetMapper.toResponseList(budgets);
}
```

- [ ] **Step 4: Run green**

```bash
npm run test:e2e -- budget.e2e-spec.ts budget.persistence.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/budget/controllers/budget.controller.ts test/budget.e2e-spec.ts test/budget.persistence.e2e-spec.ts
git commit -m "fix: filter budget listing by service order query"
```

---

### Task 5: Full Regression Verification

**Files:**
- No production changes expected.

**Interfaces:**
- Verifies budget refusal, OS cancellation, blocked budget recreation, budget listing, persistence, and build.

- [ ] **Step 1: Run focused unit tests**

```bash
npm test -- budget.entity.spec.ts budget.service.spec.ts service-order.entity.spec.ts service-order.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run focused e2e tests**

```bash
npm run test:e2e -- budget.e2e-spec.ts workshop-flow.e2e-spec.ts budget.persistence.e2e-spec.ts --runInBand
```

Expected: PASS. If Jest reports open handles after the tests finish, rerun with:

```bash
npm run test:e2e -- budget.e2e-spec.ts workshop-flow.e2e-spec.ts --runInBand --detectOpenHandles
```

and fix the leaking setup/notification/logger handle only if it is caused by this flow change.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Prisma Client generation succeeds and `nest build` exits 0.

- [ ] **Step 4: Inspect diff**

```bash
git diff --stat
git diff -- src/modules/budget src/modules/service-order test/budget.e2e-spec.ts test/workshop-flow.e2e-spec.ts test/budget.persistence.e2e-spec.ts prisma
```

Expected: diff is scoped to explicit budget refusal status, OS cancellation, budget creation guard, query filtering, and Prisma migration.

---

## Self-Review

- Spec coverage: covers the user-approved MVP behavior: `BUDGET_REFUSED` budget status, OS cancellation, no new budget for cancelled OS, no budget revision implementation.
- Placeholder scan: no placeholder markers are left as implementation steps.
- Type consistency: `BudgetStatus.BUDGET_REFUSED` is introduced before use; BudgetService keeps using `ServiceOrderController.cancel`.
- TDD coverage: each behavior change starts with red tests and includes focused green verification.
