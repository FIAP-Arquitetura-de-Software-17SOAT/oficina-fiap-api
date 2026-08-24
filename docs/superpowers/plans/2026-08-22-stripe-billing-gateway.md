# Stripe Billing Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Billing follow the domain document by generating a Stripe test-mode payment link, recording gateway payments idempotently, expiring unpaid billings, and releasing service-order delivery only after paid status.

**Architecture:** Keep `Billing` as the aggregate root and introduce a payment gateway port in the billing module. The service orchestrates cross-aggregate checks and calls a `PaymentGateway` adapter; the Stripe adapter uses Checkout Sessions in test mode, while tests use a fake adapter. Stripe webhook handling is an inbound application use case that verifies the event, maps it to a gateway transaction, and calls the same idempotent domain behavior.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, `@nestjs/config`, official `stripe` Node SDK, class-validator/class-transformer, Swagger, Jest + Supertest.

**Spec:** Notion domain page "Modelo de Dominio - Oficina FIAP (1)" and child page "07 - Cobranca"; Stripe official docs for Checkout Sessions, webhook signature verification, and test cards:
- https://burly-jackal-e00.notion.site/Modelo-de-Dom-nio-Oficina-FIAP-1-3bd6f13339bf801aa9a3eb9dd7d53146
- https://docs.stripe.com/api/checkout/sessions/create?lang=nodejs
- https://docs.stripe.com/webhooks/signature?lang=node
- https://docs.stripe.com/testing

## Global Constraints

- Use English names in code and API: `Cobranca` becomes `Billing`, `OrdemServico` becomes `ServiceOrder`, `Orcamento` becomes `Budget`.
- Keep domain rules in entity/value-object classes and throw `DomainException` only from domain objects.
- Use the shared `Money` value object from `src/shared/domain/value-objects/money.vo.ts`; do not keep billing-specific money value objects.
- Store money as integer cents in Prisma. API responses may expose decimal values.
- Do not accept calculated totals from request bodies.
- `Billing` must store `serviceOrderId` and `budgetId` as string references in the domain.
- A billing can be generated only for a service order with status `COMPLETED`.
- Billing value comes from the latest accepted budget and must be greater than zero.
- State machine must be `PENDING -> WAITING_PAYMENT -> PAID` or `PENDING/WAITING_PAYMENT -> EXPIRED`.
- `registerPayment(gatewayTransactionId, method)` must be idempotent for the same gateway transaction id.
- A paid billing is terminal.
- Payment link generation must go through the `PaymentGateway` port, not from the entity and not from a Stripe SDK call in the controller.
- Stripe must run in test mode only for local/dev use. Use `sk_test_...` keys and Stripe test cards; never use real card data.
- Do not commit Stripe credentials, account email, account password, webhook secrets, or `.env`.
- Every task ends with a commit. Use the repo's existing commit style.

---

## File Structure

- Modify `package.json` and `package-lock.json` to add the official `stripe` dependency.
- Modify `src/main.ts` to enable raw request body support for Stripe webhook signature verification.
- Modify `prisma/schema.prisma` and create a migration that reshapes `Billing` for the document model.
- Modify `src/modules/billing/enums/billing-status.enum.ts` to use `PENDING | WAITING_PAYMENT | PAID | EXPIRED`.
- Modify `src/modules/billing/enums/payment-method.enum.ts` to use `PIX | CARD | CASH`.
- Modify `src/modules/billing/entities/billing.entity.ts` around gateway link, payment registration, expiration, and idempotency.
- Delete `src/modules/billing/entities/payment.entity.ts` and `src/modules/billing/value-objects/payment-amount.vo.ts` after tests no longer reference them.
- Create `src/modules/billing/gateways/payment-gateway.ts` for the port and shared gateway DTOs.
- Create `src/modules/billing/gateways/fake-payment.gateway.ts` for unit/e2e tests.
- Create `src/modules/billing/gateways/stripe-payment.gateway.ts` for Stripe Checkout and webhook parsing.
- Modify `src/modules/billing/services/billing.service.ts` to call the gateway and handle webhook-confirmed payments.
- Modify `src/modules/billing/controllers/billing.controller.ts` to expose link generation, expiration, and Stripe webhook routes.
- Modify `src/modules/billing/dto/billing.dto.ts` and `src/modules/billing/mappers/billing.mapper.ts` for the new response contract.
- Modify `src/modules/billing/repositories/billing.repository.ts` for the new persistence shape and optimistic concurrency.
- Modify `src/modules/billing/billing.module.ts` to bind `PaymentGateway` to Stripe in runtime.
- Modify `test/in-memory-billing.repository.ts` and `test/billing.e2e-spec.ts`.
- Add/update focused unit specs beside each changed billing file.

---

### Task 1: Install Stripe SDK and Enable Raw Webhook Body

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/main.ts`
- Test: `src/main.spec.ts`

**Interfaces:**
- Produces: `NestFactory.create(AppModule, { rawBody: true })`, allowing controllers to read `req.rawBody`.
- Produces: installed `stripe` package importable as `import Stripe from 'stripe';`.

- [ ] **Step 1: Write a failing main bootstrap test**

Create `src/main.spec.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('./setup-app', () => ({
  configureApp: jest.fn((app) => app),
  setupSwagger: jest.fn(),
}));

describe('main bootstrap', () => {
  it('enables rawBody for Stripe webhook signature verification', async () => {
    const listen = jest.fn();
    (NestFactory.create as jest.Mock).mockResolvedValue({ listen });

    await import('./main');
    await new Promise(process.nextTick);

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule, {
      rawBody: true,
    });
    expect(listen).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm.cmd test -- main`

Expected: FAIL because `NestFactory.create` is currently called without `{ rawBody: true }`.

- [ ] **Step 3: Enable rawBody**

Change `src/main.ts`:

```ts
const app = await NestFactory.create(AppModule, { rawBody: true });
```

- [ ] **Step 4: Install Stripe SDK**

Run: `npm.cmd install stripe`

Expected: `package.json` contains `"stripe"` under dependencies and `package-lock.json` is updated.

- [ ] **Step 5: Verify**

Run: `npm.cmd test -- main`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/main.ts src/main.spec.ts
git commit -m "chore: add Stripe SDK and raw webhook body"
```

---

### Task 2: Reshape Billing Domain to Match the Document

**Files:**
- Modify: `src/modules/billing/enums/billing-status.enum.ts`
- Modify: `src/modules/billing/enums/payment-method.enum.ts`
- Modify: `src/modules/billing/entities/billing.entity.ts`
- Delete: `src/modules/billing/entities/payment.entity.ts`
- Delete: `src/modules/billing/value-objects/payment-amount.vo.ts`
- Test: `src/modules/billing/entities/billing.entity.spec.ts`
- Delete: `src/modules/billing/entities/payment.entity.spec.ts`
- Delete: `src/modules/billing/value-objects/payment-amount.vo.spec.ts`

**Interfaces:**
- Produces: `Billing.create(props: BillingProps): Billing`.
- Produces: `Billing.generatePaymentLink(props: GeneratePaymentLinkProps): void`.
- Produces: `Billing.registerPayment(props: RegisterPaymentProps): boolean`, returning `false` when the same gateway transaction is already recorded.
- Produces: `Billing.expire(now?: Date): void`.
- Produces getters: `getId`, `getServiceOrderId`, `getBudgetId`, `getAmount`, `getStatus`, `getPaymentLink`, `getGatewayTransactionId`, `getPaymentMethod`, `getGeneratedAt`, `getPaidAt`, `getExpiresAt`, `getCreatedAt`, `getUpdatedAt`.

- [ ] **Step 1: Replace enum tests through entity expectations**

Rewrite `src/modules/billing/entities/billing.entity.spec.ts`:

```ts
import { DomainException } from '../../../shared/domain/domain.exception';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { Billing } from './billing.entity';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const budgetId = 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

describe('Billing', () => {
  it('creates a pending billing with positive money', () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
    });

    expect(billing.getServiceOrderId()).toBe(serviceOrderId);
    expect(billing.getBudgetId()).toBe(budgetId);
    expect(billing.getAmount().valueInCents).toBe(15000);
    expect(billing.getStatus()).toBe(BillingStatus.PENDING);
    expect(billing.getPaymentLink()).toBeNull();
  });

  it('rejects zero-value billing', () => {
    expect(() =>
      Billing.create({
        serviceOrderId,
        budgetId,
        amount: Money.fromCents(0),
      }),
    ).toThrow(new DomainException('Billing amount must be greater than zero'));
  });

  it('moves pending billing to waiting payment with link data', () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
    });
    const expiresAt = new Date('2026-08-23T10:00:00.000Z');

    billing.generatePaymentLink({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt,
    });

    expect(billing.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
    expect(billing.getPaymentLink()).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
    expect(billing.getGatewayTransactionId()).toBe('cs_test_123');
    expect(billing.getExpiresAt()).toBe(expiresAt);
  });

  it('registers payment once for the same gateway transaction', () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
    });
    billing.generatePaymentLink({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-23T10:00:00.000Z'),
    });

    const first = billing.registerPayment({
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });
    const second = billing.registerPayment({
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:01:00.000Z'),
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(billing.getStatus()).toBe(BillingStatus.PAID);
    expect(billing.getPaymentMethod()).toBe(PaymentMethod.CARD);
    expect(billing.getPaidAt()?.toISOString()).toBe('2026-08-22T10:00:00.000Z');
  });

  it('rejects a different transaction after payment', () => {
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.PAID,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      paymentMethod: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    expect(() =>
      billing.registerPayment({
        gatewayTransactionId: 'cs_test_other',
        method: PaymentMethod.CARD,
      }),
    ).toThrow('Paid billing is terminal');
  });

  it('expires unpaid billing before payment', () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
    });
    billing.generatePaymentLink({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-23T10:00:00.000Z'),
    });

    billing.expire(new Date('2026-08-23T10:01:00.000Z'));

    expect(billing.getStatus()).toBe(BillingStatus.EXPIRED);
  });
});
```

- [ ] **Step 2: Run the failing entity test**

Run: `npm.cmd test -- billing.entity`

Expected: FAIL because the current model has `OPEN`, `PARTIALLY_PAID`, multiple payment entities, and no gateway link behavior.

- [ ] **Step 3: Replace billing status enum**

`src/modules/billing/enums/billing-status.enum.ts`:

```ts
export enum BillingStatus {
  PENDING = 'PENDING',
  WAITING_PAYMENT = 'WAITING_PAYMENT',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
}
```

- [ ] **Step 4: Replace payment method enum**

`src/modules/billing/enums/payment-method.enum.ts`:

```ts
export enum PaymentMethod {
  PIX = 'PIX',
  CARD = 'CARD',
  CASH = 'CASH',
}
```

- [ ] **Step 5: Implement the aggregate behavior**

Rewrite `src/modules/billing/entities/billing.entity.ts` using `Money`:

```ts
import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface BillingProps {
  serviceOrderId: string;
  budgetId: string;
  amount: Money;
  status?: BillingStatus;
  paymentLink?: string | null;
  gatewayTransactionId?: string | null;
  paymentMethod?: PaymentMethod | null;
  generatedAt?: Date;
  paidAt?: Date | null;
  expiresAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GeneratePaymentLinkProps {
  paymentLink: string;
  gatewayTransactionId: string;
  expiresAt?: Date | null;
}

export interface RegisterPaymentProps {
  gatewayTransactionId: string;
  method: PaymentMethod;
  paidAt?: Date;
}

export class Billing {
  private readonly id: string;
  private readonly serviceOrderId: string;
  private readonly budgetId: string;
  private readonly amount: Money;
  private status: BillingStatus;
  private paymentLink: string | null;
  private gatewayTransactionId: string | null;
  private paymentMethod: PaymentMethod | null;
  private readonly generatedAt: Date;
  private paidAt: Date | null;
  private expiresAt: Date | null;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: BillingProps) {
    this.id = id;
    this.serviceOrderId = this.validateRequiredId(props.serviceOrderId, 'Service order is required');
    this.budgetId = this.validateRequiredId(props.budgetId, 'Budget is required');
    if (props.amount.valueInCents <= 0) {
      throw new DomainException('Billing amount must be greater than zero');
    }
    this.amount = props.amount;
    this.status = props.status ?? BillingStatus.PENDING;
    this.paymentLink = props.paymentLink ?? null;
    this.gatewayTransactionId = props.gatewayTransactionId ?? null;
    this.paymentMethod = props.paymentMethod ?? null;
    this.generatedAt = props.generatedAt ?? new Date();
    this.paidAt = props.paidAt ?? null;
    this.expiresAt = props.expiresAt ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: BillingProps): Billing {
    return new Billing(randomUUID(), props);
  }

  static restore(id: string, props: BillingProps): Billing {
    return new Billing(id, props);
  }

  generatePaymentLink(props: GeneratePaymentLinkProps): void {
    if (this.status !== BillingStatus.PENDING) {
      throw new DomainException('Payment link can only be generated for pending billing');
    }
    this.paymentLink = this.validatePaymentLink(props.paymentLink);
    this.gatewayTransactionId = this.validateRequiredId(props.gatewayTransactionId, 'Gateway transaction is required');
    this.expiresAt = props.expiresAt ?? null;
    this.status = BillingStatus.WAITING_PAYMENT;
    this.touch();
  }

  registerPayment(props: RegisterPaymentProps): boolean {
    const gatewayTransactionId = this.validateRequiredId(props.gatewayTransactionId, 'Gateway transaction is required');
    if (this.status === BillingStatus.PAID) {
      if (this.gatewayTransactionId === gatewayTransactionId) return false;
      throw new DomainException('Paid billing is terminal');
    }
    if (this.status !== BillingStatus.WAITING_PAYMENT) {
      throw new DomainException('Payment can only be registered while waiting payment');
    }
    if (this.gatewayTransactionId !== gatewayTransactionId) {
      throw new DomainException('Gateway transaction does not match billing');
    }
    this.paymentMethod = props.method;
    this.paidAt = props.paidAt ?? new Date();
    this.status = BillingStatus.PAID;
    this.touch();
    return true;
  }

  expire(now = new Date()): void {
    if (this.status === BillingStatus.PAID) {
      throw new DomainException('Paid billing is terminal');
    }
    if (this.status === BillingStatus.EXPIRED) return;
    if (this.expiresAt && now.getTime() < this.expiresAt.getTime()) {
      throw new DomainException('Billing payment link has not expired yet');
    }
    this.status = BillingStatus.EXPIRED;
    this.touch();
  }

  getId(): string { return this.id; }
  getServiceOrderId(): string { return this.serviceOrderId; }
  getBudgetId(): string { return this.budgetId; }
  getAmount(): Money { return this.amount; }
  getStatus(): BillingStatus { return this.status; }
  getPaymentLink(): string | null { return this.paymentLink; }
  getGatewayTransactionId(): string | null { return this.gatewayTransactionId; }
  getPaymentMethod(): PaymentMethod | null { return this.paymentMethod; }
  getGeneratedAt(): Date { return this.generatedAt; }
  getPaidAt(): Date | null { return this.paidAt; }
  getExpiresAt(): Date | null { return this.expiresAt; }
  getCreatedAt(): Date { return this.createdAt; }
  getUpdatedAt(): Date { return this.updatedAt; }

  private validateRequiredId(value: string, message: string): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) throw new DomainException(message);
    return trimmed;
  }

  private validatePaymentLink(value: string): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) throw new DomainException('Payment link is required');
    return trimmed;
  }

  private touch(): void {
    const now = new Date();
    this.updatedAt = now.getTime() > this.updatedAt.getTime()
      ? now
      : new Date(this.updatedAt.getTime() + 1);
  }
}
```

- [ ] **Step 6: Remove obsolete payment files**

Delete:

```text
src/modules/billing/entities/payment.entity.ts
src/modules/billing/entities/payment.entity.spec.ts
src/modules/billing/value-objects/payment-amount.vo.ts
src/modules/billing/value-objects/payment-amount.vo.spec.ts
```

- [ ] **Step 7: Verify**

Run: `npm.cmd test -- billing.entity`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/billing
git commit -m "refactor: align Billing aggregate with payment gateway model"
```

---

### Task 3: Update Prisma Persistence Shape

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_align_billing_gateway/migration.sql`
- Modify: `src/modules/billing/mappers/billing.mapper.ts`
- Modify: `src/modules/billing/repositories/billing.repository.ts`
- Test: `src/modules/billing/mappers/billing.mapper.spec.ts`
- Test: `src/modules/billing/repositories/billing.repository.spec.ts`
- Modify: `test/prisma-schema.e2e-spec.ts`

**Interfaces:**
- Produces Prisma `Billing` fields: `budgetId`, `amountCents`, `paymentLink`, `gatewayTransactionId`, `paymentMethod`, `generatedAt`, `paidAt`, `expiresAt`.
- Removes dependency on `BillingPayment`.
- Keeps `BillingRepository.update(billing, expectedUpdatedAt): Promise<Billing | null>`.

- [ ] **Step 1: Write failing mapper test**

In `src/modules/billing/mappers/billing.mapper.spec.ts`, assert the gateway fields:

```ts
const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
  serviceOrderId,
  budgetId,
  amount: Money.fromCents(15000),
  status: BillingStatus.WAITING_PAYMENT,
  paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
  gatewayTransactionId: 'cs_test_123',
  expiresAt: new Date('2026-08-23T10:00:00.000Z'),
});

expect(BillingMapper.toPersistence(billing)).toMatchObject({
  serviceOrderId,
  budgetId,
  amountCents: 15000,
  status: BillingStatus.WAITING_PAYMENT,
  paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
  gatewayTransactionId: 'cs_test_123',
});
```

- [ ] **Step 2: Run the failing mapper/repository tests**

Run: `npm.cmd test -- billing.mapper billing.repository`

Expected: FAIL because persistence still expects `totalCents`, `paidCents`, `balanceCents`, and `BillingPayment`.

- [ ] **Step 3: Update Prisma schema**

Replace the billing enum/model section with:

```prisma
enum BillingStatus {
  PENDING
  WAITING_PAYMENT
  PAID
  EXPIRED
}

enum PaymentMethod {
  PIX
  CARD
  CASH
}

model Billing {
  id                   String         @id @db.Uuid
  serviceOrderId       String         @unique @db.Uuid
  budgetId             String         @db.Uuid
  status               BillingStatus
  amountCents          Int
  paymentLink          String?
  gatewayTransactionId String?        @unique
  paymentMethod        PaymentMethod?
  generatedAt          DateTime       @default(now())
  paidAt               DateTime?
  expiresAt            DateTime?
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

  serviceOrder ServiceOrder @relation(fields: [serviceOrderId], references: [id], onDelete: Restrict)

  @@index([status])
  @@index([budgetId])
  @@map("billing")
}
```

- [ ] **Step 4: Create migration**

Run:

```bash
npx prisma migrate dev --name align_billing_gateway
```

Expected: Prisma creates `prisma/migrations/<timestamp>_align_billing_gateway/migration.sql`.

- [ ] **Step 5: Update mapper**

`BillingMapper.toDomain(record)` must call:

```ts
Billing.restore(record.id, {
  serviceOrderId: record.serviceOrderId,
  budgetId: record.budgetId,
  amount: Money.fromCents(record.amountCents),
  status: record.status as BillingStatus,
  paymentLink: record.paymentLink,
  gatewayTransactionId: record.gatewayTransactionId,
  paymentMethod: record.paymentMethod as PaymentMethod | null,
  generatedAt: record.generatedAt,
  paidAt: record.paidAt,
  expiresAt: record.expiresAt,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});
```

- [ ] **Step 6: Update repository**

`BillingRepository.update` must write these fields:

```ts
data: {
  status: billing.getStatus(),
  amountCents: billing.getAmount().valueInCents,
  paymentLink: billing.getPaymentLink(),
  gatewayTransactionId: billing.getGatewayTransactionId(),
  paymentMethod: billing.getPaymentMethod(),
  generatedAt: billing.getGeneratedAt(),
  paidAt: billing.getPaidAt(),
  expiresAt: billing.getExpiresAt(),
  updatedAt: billing.getUpdatedAt(),
}
```

- [ ] **Step 7: Verify**

Run:

```bash
npm.cmd test -- billing.mapper billing.repository prisma-schema
npx prisma validate
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add prisma src/modules/billing test/prisma-schema.e2e-spec.ts
git commit -m "feat: persist gateway-backed Billing"
```

---

### Task 4: Add Payment Gateway Port, Fake Adapter, and Stripe Adapter

**Files:**
- Create: `src/modules/billing/gateways/payment-gateway.ts`
- Create: `src/modules/billing/gateways/fake-payment.gateway.ts`
- Create: `src/modules/billing/gateways/stripe-payment.gateway.ts`
- Test: `src/modules/billing/gateways/fake-payment.gateway.spec.ts`
- Test: `src/modules/billing/gateways/stripe-payment.gateway.spec.ts`

**Interfaces:**
- Produces abstract class `PaymentGateway`.
- Produces `createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult>`.
- Produces `parsePaymentWebhook(input: ParsePaymentWebhookInput): Promise<PaymentWebhookResult>`.

- [ ] **Step 1: Write failing fake gateway tests**

`src/modules/billing/gateways/fake-payment.gateway.spec.ts`:

```ts
import { PaymentMethod } from '../enums/payment-method.enum';
import { FakePaymentGateway } from './fake-payment.gateway';

describe('FakePaymentGateway', () => {
  it('creates deterministic test payment links', async () => {
    const gateway = new FakePaymentGateway();

    const result = await gateway.createPaymentLink({
      billingId: 'billing-1',
      serviceOrderId: 'service-order-1',
      amountInCents: 15000,
    });

    expect(result).toMatchObject({
      paymentLink: 'https://fake.stripe.test/checkout/billing-1',
      gatewayTransactionId: 'fake_session_billing-1',
    });
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('returns configured webhook payment result', async () => {
    const gateway = new FakePaymentGateway();
    gateway.queueWebhookResult({
      type: 'payment_confirmed',
      gatewayTransactionId: 'fake_session_billing-1',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await expect(
      gateway.parsePaymentWebhook({ payload: Buffer.from('{}'), signature: 'test' }),
    ).resolves.toMatchObject({ type: 'payment_confirmed' });
  });
});
```

- [ ] **Step 2: Create gateway port**

`src/modules/billing/gateways/payment-gateway.ts`:

```ts
import { PaymentMethod } from '../enums/payment-method.enum';

export interface CreatePaymentLinkInput {
  billingId: string;
  serviceOrderId: string;
  amountInCents: number;
}

export interface CreatePaymentLinkResult {
  paymentLink: string;
  gatewayTransactionId: string;
  expiresAt: Date | null;
}

export interface ParsePaymentWebhookInput {
  payload: Buffer | string;
  signature: string;
}

export type PaymentWebhookResult =
  | {
      type: 'payment_confirmed';
      gatewayTransactionId: string;
      method: PaymentMethod;
      paidAt: Date;
    }
  | { type: 'ignored'; reason: string };

export abstract class PaymentGateway {
  abstract createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult>;

  abstract parsePaymentWebhook(
    input: ParsePaymentWebhookInput,
  ): Promise<PaymentWebhookResult>;
}
```

- [ ] **Step 3: Implement fake gateway**

`src/modules/billing/gateways/fake-payment.gateway.ts`:

```ts
import {
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
  ParsePaymentWebhookInput,
  PaymentGateway,
  PaymentWebhookResult,
} from './payment-gateway';

export class FakePaymentGateway extends PaymentGateway {
  private webhookResults: PaymentWebhookResult[] = [];

  async createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    return {
      paymentLink: `https://fake.stripe.test/checkout/${input.billingId}`,
      gatewayTransactionId: `fake_session_${input.billingId}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  async parsePaymentWebhook(
    _input: ParsePaymentWebhookInput,
  ): Promise<PaymentWebhookResult> {
    return this.webhookResults.shift() ?? {
      type: 'ignored',
      reason: 'No fake webhook event queued',
    };
  }

  queueWebhookResult(result: PaymentWebhookResult): void {
    this.webhookResults.push(result);
  }
}
```

- [ ] **Step 4: Write Stripe adapter tests with mocked SDK**

In `stripe-payment.gateway.spec.ts`, mock `stripe.checkout.sessions.create` and `stripe.webhooks.constructEvent`; assert `mode: 'payment'`, `currency: 'brl'`, `metadata.billingId`, and mapping of `checkout.session.completed` to `PaymentMethod.CARD`.

- [ ] **Step 5: Implement Stripe adapter**

`StripePaymentGateway` constructor must read:

```ts
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
PAYMENT_SUCCESS_URL
PAYMENT_CANCEL_URL
```

`createPaymentLink` must call `checkout.sessions.create` with:

```ts
{
  mode: 'payment',
  success_url: successUrl,
  cancel_url: cancelUrl,
  client_reference_id: input.billingId,
  metadata: {
    billingId: input.billingId,
    serviceOrderId: input.serviceOrderId,
  },
  line_items: [
    {
      quantity: 1,
      price_data: {
        currency: 'brl',
        unit_amount: input.amountInCents,
        product_data: {
          name: `Oficina FIAP service order ${input.serviceOrderId}`,
        },
      },
    },
  ],
}
```

Map the returned Checkout Session:

```ts
return {
  paymentLink: session.url!,
  gatewayTransactionId: session.id,
  expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
};
```

- [ ] **Step 6: Verify**

Run: `npm.cmd test -- payment.gateway stripe-payment.gateway fake-payment.gateway`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/billing/gateways
git commit -m "feat: add Stripe payment gateway adapter"
```

---

### Task 5: Wire Billing Service and HTTP API to the Gateway

**Files:**
- Modify: `src/modules/billing/services/billing.service.ts`
- Modify: `src/modules/billing/controllers/billing.controller.ts`
- Modify: `src/modules/billing/dto/billing.dto.ts`
- Modify: `src/modules/billing/mappers/billing.mapper.ts`
- Modify: `src/modules/billing/billing.module.ts`
- Test: `src/modules/billing/services/billing.service.spec.ts`
- Test: `src/modules/billing/controllers/billing.controller.spec.ts`

**Interfaces:**
- Produces `BillingService.generateForServiceOrder(dto): Promise<Billing>` that creates billing and payment link.
- Produces `BillingService.handlePaymentWebhook(payload: Buffer | string, signature: string): Promise<void>`.
- Produces `BillingService.expire(id: string): Promise<Billing>`.
- Produces controller route `POST /api/v1/billings`.
- Produces controller route `POST /api/v1/billings/stripe/webhook`.
- Produces controller route `POST /api/v1/billings/:id/expire`.

- [ ] **Step 1: Write service tests for link generation and webhook idempotency**

Add to `billing.service.spec.ts`:

```ts
it('generates billing and stores Stripe payment link', async () => {
  paymentGateway.createPaymentLink.mockResolvedValue({
    paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
    gatewayTransactionId: 'cs_test_123',
    expiresAt: new Date('2026-08-23T10:00:00.000Z'),
  });

  const billing = await service.generateForServiceOrder({ serviceOrderId });

  expect(billing.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
  expect(billing.getPaymentLink()).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
  expect(paymentGateway.createPaymentLink).toHaveBeenCalledWith({
    billingId: billing.getId(),
    serviceOrderId,
    amountInCents: 15000,
  });
});

it('handles duplicated Stripe webhook idempotently', async () => {
  const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
    serviceOrderId,
    budgetId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    amount: Money.fromCents(15000),
    status: BillingStatus.WAITING_PAYMENT,
    paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
    gatewayTransactionId: 'cs_test_123',
  });
  repository.findByGatewayTransactionId.mockResolvedValue(billing);
  repository.update.mockImplementation(async (updated) => updated);
  paymentGateway.parsePaymentWebhook.mockResolvedValue({
    type: 'payment_confirmed',
    gatewayTransactionId: 'cs_test_123',
    method: PaymentMethod.CARD,
    paidAt: new Date('2026-08-22T10:00:00.000Z'),
  });

  await service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature');
  await service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature');

  expect(repository.update).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run failing service tests**

Run: `npm.cmd test -- billing.service`

Expected: FAIL because `PaymentGateway` is not injected and webhook use case does not exist.

- [ ] **Step 3: Inject gateway into service**

Add constructor dependency:

```ts
private readonly paymentGateway: PaymentGateway
```

- [ ] **Step 4: Update generation flow**

After creating the pending billing in memory and before returning, call gateway and persist the link:

```ts
const billing = Billing.create({
  serviceOrderId,
  budgetId: acceptedBudget.getId(),
  amount: Money.fromDecimal(acceptedBudget.getTotalAmount()),
});

const created = await this.billingRepository.create(billing);
const link = await this.paymentGateway.createPaymentLink({
  billingId: created.getId(),
  serviceOrderId,
  amountInCents: created.getAmount().valueInCents,
});
created.generatePaymentLink(link);
return this.persistUpdatedBilling(created, created.getUpdatedAt());
```

- [ ] **Step 5: Add repository lookup**

Add `findByGatewayTransactionId(gatewayTransactionId: string): Promise<Billing | null>` to `BillingRepository` and `InMemoryBillingRepository`.

- [ ] **Step 6: Add webhook handling**

```ts
async handlePaymentWebhook(
  payload: Buffer | string,
  signature: string,
): Promise<void> {
  const event = await this.paymentGateway.parsePaymentWebhook({ payload, signature });
  if (event.type === 'ignored') return;

  const billing = await this.billingRepository.findByGatewayTransactionId(
    event.gatewayTransactionId,
  );
  if (!billing) throw new NotFoundException('Billing not found');

  const expectedUpdatedAt = new Date(billing.getUpdatedAt());
  const changed = billing.registerPayment({
    gatewayTransactionId: event.gatewayTransactionId,
    method: event.method,
    paidAt: event.paidAt,
  });
  if (!changed) return;

  await this.persistUpdatedBilling(billing, expectedUpdatedAt);
}
```

- [ ] **Step 7: Wire controller webhook**

Use raw body and Stripe signature header:

```ts
@Post('stripe/webhook')
@HttpCode(HttpStatus.NO_CONTENT)
async handleStripeWebhook(
  @Req() request: RawBodyRequest<Request>,
  @Headers('stripe-signature') signature: string,
): Promise<void> {
  await this.billingService.handlePaymentWebhook(request.rawBody, signature);
}
```

- [ ] **Step 8: Bind gateway provider**

In `billing.module.ts`:

```ts
providers: [
  BillingService,
  BillingRepository,
  { provide: PaymentGateway, useClass: StripePaymentGateway },
],
```

- [ ] **Step 9: Verify**

Run: `npm.cmd test -- billing.service billing.controller`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/modules/billing test/in-memory-billing.repository.ts
git commit -m "feat: wire Billing to payment gateway"
```

---

### Task 6: Update E2E Coverage and Test-Mode Documentation

**Files:**
- Modify: `test/billing.e2e-spec.ts`
- Modify: `test/in-memory-billing.repository.ts`
- Modify: `src/modules/billing/dto/billing.dto.ts`
- Modify: `README.md`

**Interfaces:**
- Produces e2e proof that Billing returns a payment link, accepts a fake Stripe webhook, ignores duplicate webhooks, and permits delivery only after payment.
- Produces README instructions for Stripe test mode without storing credentials.

- [ ] **Step 1: Write e2e test for generated payment link**

Update the existing billing e2e generation assertion:

```ts
expect(response.body).toMatchObject({
  serviceOrderId,
  budgetId: latestBudget.id,
  status: 'WAITING_PAYMENT',
  amount: 150,
  paymentLink: expect.stringContaining('https://fake.stripe.test/checkout/'),
  paymentMethod: null,
  paidAt: null,
});
```

- [ ] **Step 2: Write e2e test for webhook payment and duplicate idempotency**

Add:

```ts
const gateway = app.get(PaymentGateway) as FakePaymentGateway;
gateway.queueWebhookResult({
  type: 'payment_confirmed',
  gatewayTransactionId: billing.body.gatewayTransactionId,
  method: PaymentMethod.CARD,
  paidAt: new Date('2026-08-22T10:00:00.000Z'),
});

await request(http)
  .post('/api/v1/billings/stripe/webhook')
  .set('stripe-signature', 'fake-signature')
  .send({ id: 'evt_1' })
  .expect(204);

gateway.queueWebhookResult({
  type: 'payment_confirmed',
  gatewayTransactionId: billing.body.gatewayTransactionId,
  method: PaymentMethod.CARD,
  paidAt: new Date('2026-08-22T10:01:00.000Z'),
});

await request(http)
  .post('/api/v1/billings/stripe/webhook')
  .set('stripe-signature', 'fake-signature')
  .send({ id: 'evt_1_duplicate' })
  .expect(204);

const paid = await request(http)
  .get(`/api/v1/billings/${billing.body.id}`)
  .expect(200);

expect(paid.body.status).toBe('PAID');
expect(paid.body.paidAt).toBe('2026-08-22T10:00:00.000Z');
```

- [ ] **Step 3: Override gateway in e2e module**

In the test module setup:

```ts
.overrideProvider(PaymentGateway)
.useValue(new FakePaymentGateway())
```

- [ ] **Step 4: Update README Stripe test-mode section**

Add:

```md
## Stripe test mode

This project uses Stripe Checkout Sessions through the Billing payment gateway.
Use only Stripe test mode keys in local development:

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
PAYMENT_SUCCESS_URL=http://localhost:3000/api/v1/billings/payment-success
PAYMENT_CANCEL_URL=http://localhost:3000/api/v1/billings/payment-cancel
```

For an interactive successful card payment in Stripe Checkout, use card number
`4242 4242 4242 4242`, any future expiration date, any CVC, and any postal code.
Stripe test-mode transactions do not move real money.
```

- [ ] **Step 5: Verify unit, e2e, build, and Prisma**

Run:

```bash
npm.cmd test -- billing
npm.cmd run test:e2e -- billing
npm.cmd run build
npx prisma validate
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add README.md test src/modules/billing prisma package.json package-lock.json
git commit -m "test: cover Stripe-backed Billing flow"
```

---

## Self-Review

- Spec coverage: The plan covers link generation, gateway port, fake adapter, Stripe test adapter, `idTransacaoGateway` idempotency, payment status terminal behavior, expiration, `orcamentoId`/`budgetId`, money in cents, and delivery after payment.
- Intentional scope: The plan uses Stripe Checkout test mode for card payments. It keeps `PIX` and `CASH` in the enum because the domain document names them, but Stripe webhook mapping initially produces `CARD`.
- Secret handling: The plan does not store account credentials. Runtime uses `.env` with Stripe test keys and webhook secret.
- Verification coverage: Each task includes a failing-test step and a passing verification step; final verification includes unit tests, e2e tests, build, and Prisma validation.
