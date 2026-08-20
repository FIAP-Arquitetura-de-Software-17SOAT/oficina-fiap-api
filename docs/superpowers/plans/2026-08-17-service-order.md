# Ordem de Serviço (ServiceOrder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `ServiceOrder` DDD module (aggregate, repository, use cases, HTTP API) implementing the "Ordem de Serviço" epic — Abrir OS, Consultar OS, Iniciar Diagnóstico, Aguardar Aprovação, Aguardar Peças, Iniciar Serviço, Finalizar OS, Cancelar OS.

**Architecture:** Mirrors `src/modules/client` exactly: aggregate root entity with private constructor + `create`/`restore` factories enforcing invariants via `DomainException`, a thin Prisma-backed repository, an application service orchestrating use cases (404/409 via Nest exceptions), a controller mapping HTTP to service calls, and a static mapper unwrapping the entity at the HTTP boundary.

**Tech Stack:** NestJS 11, Prisma 7 (`@prisma/adapter-pg`), class-validator/class-transformer, Jest + Supertest.

## Global Constraints

- Identifiers (classes, methods, properties) in English; domain-rule error messages in Portuguese (see `DomainException` messages in `src/modules/client`).
- Domain rule violations throw `DomainException` (from `src/shared/domain/domain.exception.ts`) — the global `DomainExceptionFilter` turns these into HTTP 400 automatically. Never throw it from outside entities/value-objects.
- Application-level errors (not found) use Nest's `NotFoundException`.
- All HTTP routes are served under the global prefix `api/v1` (set in `src/setup-app.ts`); do not add the prefix yourself in `@Controller()` — Nest adds it automatically.
- DTOs use `@Transform(trim)` (same helper as in `src/modules/client/dto/client.dto.ts`) on every string input field and `class-validator` decorators; `ValidationPipe` is global with `whitelist: true, forbidNonWhitelisted: true` so unknown fields already 400 automatically.
- `vehicleId` is stored as an opaque string — do not validate its existence against any Vehicle table/module (it doesn't exist yet). Only `clientId` is validated to exist, by calling `ClientService.findById` (not `ClientRepository` directly — `ClientModule` only exports `ClientService`).
- Jest coverage threshold is global 80% (branches/functions/lines/statements) per `package.json`; `.module.ts` and `.dto.ts` files are excluded from coverage.
- Every task ends with a commit. Use the repo's existing commit style (`type: short description`, e.g. `feat: add ServiceOrder aggregate`).

---

### Task 1: `ServiceOrderStatus` enum + `ServiceOrder` aggregate entity

**Files:**
- Create: `src/modules/service-order/enums/service-order-status.enum.ts`
- Create: `src/modules/service-order/entities/service-order.entity.ts`
- Test: `src/modules/service-order/entities/service-order.entity.spec.ts`

**Interfaces:**
- Produces: `ServiceOrderStatus` enum with values `RECEIVED | IN_DIAGNOSIS | AWAITING_APPROVAL | AWAITING_PARTS | IN_PROGRESS | COMPLETED | CANCELLED`.
- Produces: `ServiceOrderProps { clientId: string; vehicleId: string; description: string; status?: ServiceOrderStatus; cancellationReason?: string | null; createdAt?: Date; updatedAt?: Date }`.
- Produces: `ServiceOrder` class — `static create(props): ServiceOrder`, `static restore(id, props): ServiceOrder`, `getId/getClientId/getVehicleId/getDescription/getStatus/getCancellationReason/getCreatedAt/getUpdatedAt(): ...`, `startDiagnosis()/awaitApproval()/awaitParts()/startProgress()/complete(): void`, `cancel(reason: string): void`. All mutation methods throw `DomainException` on invalid state/transition.

- [ ] **Step 1: Create the enum**

`src/modules/service-order/enums/service-order-status.enum.ts`:

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

- [ ] **Step 2: Write the failing test**

`src/modules/service-order/entities/service-order.entity.spec.ts`:

```ts
import { DomainException } from '../../../shared/domain/domain.exception';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';
import { ServiceOrder, ServiceOrderProps } from './service-order.entity';

const validProps = (
  overrides: Partial<ServiceOrderProps> = {},
): ServiceOrderProps => ({
  clientId: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  vehicleId: 'a1b2c3d4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  description: 'Barulho no motor',
  ...overrides,
});

describe('ServiceOrder', () => {
  describe('create', () => {
    it('gera um id novo', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('inicia com status RECEIVED', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getStatus()).toBe(ServiceOrderStatus.RECEIVED);
    });

    it('não tem motivo de cancelamento ao criar', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getCancellationReason()).toBeNull();
    });

    it('normaliza campos de texto', () => {
      const os = ServiceOrder.create(
        validProps({ description: '  Barulho no motor  ' }),
      );

      expect(os.getDescription()).toBe('Barulho no motor');
    });

    it('define createdAt e updatedAt quando não informados', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getCreatedAt()).toBeInstanceOf(Date);
      expect(os.getUpdatedAt()).toBeInstanceOf(Date);
    });
  });

  describe('invariantes', () => {
    it.each([
      [
        'clientId vazio',
        { clientId: '   ' },
        'Cliente da ordem de serviço é obrigatório',
      ],
      [
        'vehicleId vazio',
        { vehicleId: '' },
        'Veículo da ordem de serviço é obrigatório',
      ],
      [
        'description vazia',
        { description: '  ' },
        'Descrição da ordem de serviço é obrigatória',
      ],
    ])('recusa OS com %s', (_label, overrides, message) => {
      expect(() => ServiceOrder.create(validProps(overrides))).toThrow(
        message,
      );
    });

    it('lança DomainException e não Error genérico', () => {
      expect(() =>
        ServiceOrder.create(validProps({ description: '' })),
      ).toThrow(DomainException);
    });
  });

  describe('restore', () => {
    it('preserva id, status e datas vindas do banco', () => {
      const createdAt = new Date('2026-01-01T10:00:00.000Z');
      const updatedAt = new Date('2026-02-01T10:00:00.000Z');

      const os = ServiceOrder.restore(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        validProps({
          status: ServiceOrderStatus.IN_DIAGNOSIS,
          createdAt,
          updatedAt,
        }),
      );

      expect(os.getId()).toBe('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c');
      expect(os.getStatus()).toBe(ServiceOrderStatus.IN_DIAGNOSIS);
      expect(os.getCreatedAt()).toBe(createdAt);
      expect(os.getUpdatedAt()).toBe(updatedAt);
    });
  });

  describe('transições de status', () => {
    const oldDate = new Date('2020-01-01T00:00:00.000Z');

    const restoredAt = (status: ServiceOrderStatus) =>
      ServiceOrder.restore(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        validProps({ status, createdAt: oldDate, updatedAt: oldDate }),
      );

    it.each([
      [
        ServiceOrderStatus.RECEIVED,
        (os: ServiceOrder) => os.startDiagnosis(),
        ServiceOrderStatus.IN_DIAGNOSIS,
      ],
      [
        ServiceOrderStatus.IN_DIAGNOSIS,
        (os: ServiceOrder) => os.awaitApproval(),
        ServiceOrderStatus.AWAITING_APPROVAL,
      ],
      [
        ServiceOrderStatus.AWAITING_APPROVAL,
        (os: ServiceOrder) => os.awaitParts(),
        ServiceOrderStatus.AWAITING_PARTS,
      ],
      [
        ServiceOrderStatus.AWAITING_APPROVAL,
        (os: ServiceOrder) => os.startProgress(),
        ServiceOrderStatus.IN_PROGRESS,
      ],
      [
        ServiceOrderStatus.AWAITING_PARTS,
        (os: ServiceOrder) => os.startProgress(),
        ServiceOrderStatus.IN_PROGRESS,
      ],
      [
        ServiceOrderStatus.IN_PROGRESS,
        (os: ServiceOrder) => os.complete(),
        ServiceOrderStatus.COMPLETED,
      ],
    ])('permite transição válida a partir de %s', (from, act, expected) => {
      const os = restoredAt(from);

      act(os);

      expect(os.getStatus()).toBe(expected);
      expect(os.getUpdatedAt().getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it.each([
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.awaitApproval()],
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.startProgress()],
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.complete()],
      [
        ServiceOrderStatus.IN_DIAGNOSIS,
        (os: ServiceOrder) => os.startDiagnosis(),
      ],
      [
        ServiceOrderStatus.IN_DIAGNOSIS,
        (os: ServiceOrder) => os.startProgress(),
      ],
      [
        ServiceOrderStatus.AWAITING_APPROVAL,
        (os: ServiceOrder) => os.startDiagnosis(),
      ],
      [
        ServiceOrderStatus.AWAITING_PARTS,
        (os: ServiceOrder) => os.awaitApproval(),
      ],
      [ServiceOrderStatus.IN_PROGRESS, (os: ServiceOrder) => os.awaitParts()],
      [ServiceOrderStatus.COMPLETED, (os: ServiceOrder) => os.startDiagnosis()],
      [
        ServiceOrderStatus.COMPLETED,
        (os: ServiceOrder) => os.cancel('motivo'),
      ],
      [
        ServiceOrderStatus.CANCELLED,
        (os: ServiceOrder) => os.startDiagnosis(),
      ],
    ])('recusa transição inválida a partir de %s', (from, act) => {
      const os = restoredAt(from);

      expect(() => act(os)).toThrow(DomainException);
      expect(os.getStatus()).toBe(from);
    });

    it.each([
      ServiceOrderStatus.RECEIVED,
      ServiceOrderStatus.IN_DIAGNOSIS,
      ServiceOrderStatus.AWAITING_APPROVAL,
      ServiceOrderStatus.AWAITING_PARTS,
      ServiceOrderStatus.IN_PROGRESS,
    ])('cancel() cancela a partir de %s com motivo', (from) => {
      const os = restoredAt(from);

      os.cancel('Cliente desistiu');

      expect(os.getStatus()).toBe(ServiceOrderStatus.CANCELLED);
      expect(os.getCancellationReason()).toBe('Cliente desistiu');
    });

    it('cancel() recusa motivo vazio', () => {
      const os = restoredAt(ServiceOrderStatus.RECEIVED);

      expect(() => os.cancel('  ')).toThrow(
        'Motivo do cancelamento é obrigatório',
      );
      expect(os.getStatus()).toBe(ServiceOrderStatus.RECEIVED);
    });

    it('cancel() recusa a partir de estado terminal', () => {
      const os = restoredAt(ServiceOrderStatus.COMPLETED);

      expect(() => os.cancel('motivo')).toThrow(DomainException);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest service-order.entity.spec.ts`
Expected: FAIL — `Cannot find module './service-order.entity'`.

- [ ] **Step 4: Write the implementation**

`src/modules/service-order/entities/service-order.entity.ts`:

```ts
import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';

export interface ServiceOrderProps {
  clientId: string;
  vehicleId: string;
  description: string;
  status?: ServiceOrderStatus;
  cancellationReason?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  [ServiceOrderStatus.RECEIVED]: [
    ServiceOrderStatus.IN_DIAGNOSIS,
    ServiceOrderStatus.CANCELLED,
  ],
  [ServiceOrderStatus.IN_DIAGNOSIS]: [
    ServiceOrderStatus.AWAITING_APPROVAL,
    ServiceOrderStatus.CANCELLED,
  ],
  [ServiceOrderStatus.AWAITING_APPROVAL]: [
    ServiceOrderStatus.AWAITING_PARTS,
    ServiceOrderStatus.IN_PROGRESS,
    ServiceOrderStatus.CANCELLED,
  ],
  [ServiceOrderStatus.AWAITING_PARTS]: [
    ServiceOrderStatus.IN_PROGRESS,
    ServiceOrderStatus.CANCELLED,
  ],
  [ServiceOrderStatus.IN_PROGRESS]: [
    ServiceOrderStatus.COMPLETED,
    ServiceOrderStatus.CANCELLED,
  ],
  [ServiceOrderStatus.COMPLETED]: [],
  [ServiceOrderStatus.CANCELLED]: [],
};

export class ServiceOrder {
  private readonly id: string;
  private clientId: string;
  private vehicleId: string;
  private description: string;
  private status: ServiceOrderStatus;
  private cancellationReason: string | null;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: ServiceOrderProps) {
    this.id = id;

    this.setClientId(props.clientId);
    this.setVehicleId(props.vehicleId);
    this.setDescription(props.description);

    this.status = props.status ?? ServiceOrderStatus.RECEIVED;
    this.cancellationReason = props.cancellationReason ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: ServiceOrderProps): ServiceOrder {
    return new ServiceOrder(randomUUID(), props);
  }

  static restore(id: string, props: ServiceOrderProps): ServiceOrder {
    return new ServiceOrder(id, props);
  }

  getId(): string {
    return this.id;
  }

  getClientId(): string {
    return this.clientId;
  }

  getVehicleId(): string {
    return this.vehicleId;
  }

  getDescription(): string {
    return this.description;
  }

  getStatus(): ServiceOrderStatus {
    return this.status;
  }

  getCancellationReason(): string | null {
    return this.cancellationReason;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  startDiagnosis(): void {
    this.transitionTo(ServiceOrderStatus.IN_DIAGNOSIS);
  }

  awaitApproval(): void {
    this.transitionTo(ServiceOrderStatus.AWAITING_APPROVAL);
  }

  awaitParts(): void {
    this.transitionTo(ServiceOrderStatus.AWAITING_PARTS);
  }

  startProgress(): void {
    this.transitionTo(ServiceOrderStatus.IN_PROGRESS);
  }

  complete(): void {
    this.transitionTo(ServiceOrderStatus.COMPLETED);
  }

  cancel(reason: string): void {
    const trimmed = (reason ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Motivo do cancelamento é obrigatório');
    }

    this.transitionTo(ServiceOrderStatus.CANCELLED);
    this.cancellationReason = trimmed;
  }

  private transitionTo(target: ServiceOrderStatus): void {
    const allowed = ALLOWED_TRANSITIONS[this.status];

    if (!allowed.includes(target)) {
      throw new DomainException(
        `Transição de status inválida: ${this.status} -> ${target}`,
      );
    }

    this.status = target;
    this.touch();
  }

  private setClientId(clientId: string): void {
    const trimmed = (clientId ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Cliente da ordem de serviço é obrigatório');
    }

    this.clientId = trimmed;
  }

  private setVehicleId(vehicleId: string): void {
    const trimmed = (vehicleId ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Veículo da ordem de serviço é obrigatório');
    }

    this.vehicleId = trimmed;
  }

  private setDescription(description: string): void {
    const trimmed = (description ?? '').trim();

    if (!trimmed) {
      throw new DomainException(
        'Descrição da ordem de serviço é obrigatória',
      );
    }

    this.description = trimmed;
  }

  private touch(): void {
    this.updatedAt = new Date();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest service-order.entity.spec.ts`
Expected: PASS (all tests green).

- [ ] **Step 6: Commit**

```bash
git add src/modules/service-order/enums/service-order-status.enum.ts src/modules/service-order/entities/service-order.entity.ts src/modules/service-order/entities/service-order.entity.spec.ts
git commit -m "feat: add ServiceOrder aggregate with status transitions"
```

---

### Task 2: Prisma schema + migration for `service_order`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: (generated) `prisma/migrations/<timestamp>_add_service_order/migration.sql`

**Interfaces:**
- Produces: Prisma model `ServiceOrder` mapped to table `service_order`, with fields `id, clientId, vehicleId, description, status, cancellationReason, createdAt, updatedAt` — consumed by Task 3's repository as `this.prisma.serviceOrder`.

- [ ] **Step 1: Add the model to the schema**

Append to `prisma/schema.prisma` (after the existing `Client` model):

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

- [ ] **Step 2: Ensure a local database is available**

If `.env` does not exist yet:

```bash
cp .env.sample .env
```

Start Postgres:

```bash
docker compose up -d db
```

Wait until healthy: `docker compose ps` should show `db` as `healthy` (retry `docker compose ps` every few seconds if it still says `starting`).

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_service_order`
Expected: output ends with `Your database is now in sync with your schema.` and a new folder `prisma/migrations/<timestamp>_add_service_order/migration.sql` is created containing a `CREATE TABLE "service_order" (...)` statement. This also regenerates the Prisma client in `generated/prisma`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add service_order table"
```

---

### Task 3: `ServiceOrderRepository`

**Files:**
- Create: `src/modules/service-order/repositories/service-order.repository.ts`
- Test: `src/modules/service-order/repositories/service-order.repository.spec.ts`

**Interfaces:**
- Consumes: `ServiceOrder.restore(id, props)`, `ServiceOrder#getId/getClientId/getVehicleId/getDescription/getStatus/getCancellationReason/getCreatedAt/getUpdatedAt()` (Task 1). `PrismaService` from `src/shared/database/prisma.service.ts` (its `serviceOrder` model, generated in Task 2).
- Produces: `ServiceOrderRepository` — `create(serviceOrder: ServiceOrder): Promise<ServiceOrder>`, `findById(id: string): Promise<ServiceOrder | null>`, `findAll(): Promise<ServiceOrder[]>`, `update(serviceOrder: ServiceOrder): Promise<ServiceOrder>`. Consumed by Task 5's service.

- [ ] **Step 1: Write the failing test**

`src/modules/service-order/repositories/service-order.repository.spec.ts`:

```ts
import { PrismaService } from '../../../shared/database/prisma.service';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';
import { ServiceOrderRepository } from './service-order.repository';

const row = {
  id: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  description: 'Barulho no motor',
  status: 'RECEIVED',
  cancellationReason: null as string | null,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

describe('ServiceOrderRepository', () => {
  let repository: ServiceOrderRepository;
  let prisma: {
    serviceOrder: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      serviceOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    repository = new ServiceOrderRepository(prisma as unknown as PrismaService);
  });

  it('grava os campos primitivos ao criar', async () => {
    prisma.serviceOrder.create.mockResolvedValue(row);
    const serviceOrder = ServiceOrder.create({
      clientId: row.clientId,
      vehicleId: row.vehicleId,
      description: '  Barulho no motor  ',
    });

    await repository.create(serviceOrder);

    expect(prisma.serviceOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: row.clientId,
        vehicleId: row.vehicleId,
        description: 'Barulho no motor',
        status: ServiceOrderStatus.RECEIVED,
        cancellationReason: null,
      }) as unknown,
    });
  });

  it('reconstrói a entidade a partir da linha do banco', async () => {
    prisma.serviceOrder.create.mockResolvedValue(row);

    const serviceOrder = await repository.create(
      ServiceOrder.create({
        clientId: row.clientId,
        vehicleId: row.vehicleId,
        description: row.description,
      }),
    );

    expect(serviceOrder.getId()).toBe(row.id);
    expect(serviceOrder.getStatus()).toBe(ServiceOrderStatus.RECEIVED);
    expect(serviceOrder.getCreatedAt()).toEqual(row.createdAt);
  });

  it('findById consulta pelo id e retorna null quando não encontra', async () => {
    prisma.serviceOrder.findUnique.mockResolvedValue(row);

    const found = await repository.findById(row.id);

    expect(prisma.serviceOrder.findUnique).toHaveBeenCalledWith({
      where: { id: row.id },
    });
    expect(found?.getId()).toBe(row.id);

    prisma.serviceOrder.findUnique.mockResolvedValue(null);
    await expect(repository.findById('x')).resolves.toBeNull();
  });

  it('findAll ordena do mais recente para o mais antigo', async () => {
    prisma.serviceOrder.findMany.mockResolvedValue([row]);

    const serviceOrders = await repository.findAll();

    expect(prisma.serviceOrder.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(serviceOrders).toHaveLength(1);
    expect(serviceOrders[0].getId()).toBe(row.id);
  });

  it('update envia apenas status, motivo de cancelamento e updatedAt', async () => {
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
      updatedAt: serviceOrder.getUpdatedAt(),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest service-order.repository.spec.ts`
Expected: FAIL — `Cannot find module './service-order.repository'`.

- [ ] **Step 3: Write the implementation**

`src/modules/service-order/repositories/service-order.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';

interface ServiceOrderRow {
  id: string;
  clientId: string;
  vehicleId: string;
  description: string;
  status: string;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ServiceOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    const row = await this.prisma.serviceOrder.create({
      data: this.toPersistence(serviceOrder),
    });

    return this.toDomain(row);
  }

  async findById(id: string): Promise<ServiceOrder | null> {
    const row = await this.prisma.serviceOrder.findUnique({ where: { id } });

    return row ? this.toDomain(row) : null;
  }

  async findAll(): Promise<ServiceOrder[]> {
    const rows = await this.prisma.serviceOrder.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async update(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    const row = await this.prisma.serviceOrder.update({
      where: { id: serviceOrder.getId() },
      data: {
        status: serviceOrder.getStatus(),
        cancellationReason: serviceOrder.getCancellationReason(),
        updatedAt: serviceOrder.getUpdatedAt(),
      },
    });

    return this.toDomain(row);
  }

  private toPersistence(serviceOrder: ServiceOrder) {
    return {
      id: serviceOrder.getId(),
      clientId: serviceOrder.getClientId(),
      vehicleId: serviceOrder.getVehicleId(),
      description: serviceOrder.getDescription(),
      status: serviceOrder.getStatus(),
      cancellationReason: serviceOrder.getCancellationReason(),
      createdAt: serviceOrder.getCreatedAt(),
      updatedAt: serviceOrder.getUpdatedAt(),
    };
  }

  private toDomain(row: ServiceOrderRow): ServiceOrder {
    return ServiceOrder.restore(row.id, {
      clientId: row.clientId,
      vehicleId: row.vehicleId,
      description: row.description,
      status: row.status as ServiceOrderStatus,
      cancellationReason: row.cancellationReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest service-order.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/service-order/repositories
git commit -m "feat: add ServiceOrderRepository"
```

---

### Task 4: DTOs + `ServiceOrderMapper`

**Files:**
- Create: `src/modules/service-order/dto/service-order.dto.ts`
- Create: `src/modules/service-order/mappers/service-order.mapper.ts`
- Test: `src/modules/service-order/mappers/service-order.mapper.spec.ts`

**Interfaces:**
- Consumes: `ServiceOrder` (Task 1) getters.
- Produces: `OpenServiceOrderDto { clientId: string; vehicleId: string; description: string }`, `CancelServiceOrderDto { reason: string }`, `ServiceOrderResponseDto { id, clientId, vehicleId, description, status, cancellationReason, createdAt, updatedAt }`. `ServiceOrderMapper.toResponse(serviceOrder: ServiceOrder): ServiceOrderResponseDto`, `ServiceOrderMapper.toResponseList(serviceOrders: ServiceOrder[]): ServiceOrderResponseDto[]` — consumed by Task 6's controller.

- [ ] **Step 1: Create the DTOs (no independent test — covered via mapper/controller/e2e tests, same as `client.dto.ts`)**

`src/modules/service-order/dto/service-order.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class OpenServiceOrderDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Id do cliente dono da ordem de serviço',
  })
  @IsUUID()
  clientId: string;

  @ApiProperty({
    example: 'a1b2c3d4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description:
      'Id do veículo. Não é validado nesta fase (módulo Veículo ainda não existe).',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({ example: 'Barulho no motor ao acelerar' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  description: string;
}

export class CancelServiceOrderDto {
  @ApiProperty({ example: 'Cliente desistiu do serviço' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ServiceOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty()
  vehicleId: string;

  @ApiProperty()
  description: string;

  @ApiProperty({
    enum: [
      'RECEIVED',
      'IN_DIAGNOSIS',
      'AWAITING_APPROVAL',
      'AWAITING_PARTS',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ],
  })
  status: string;

  @ApiProperty({ nullable: true, type: String })
  cancellationReason: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Write the failing test for the mapper**

`src/modules/service-order/mappers/service-order.mapper.spec.ts`:

```ts
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';
import { ServiceOrderMapper } from './service-order.mapper';

const makeServiceOrder = () =>
  ServiceOrder.create({
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Barulho no motor',
  });

describe('ServiceOrderMapper', () => {
  it('desembrulha a entidade em campos primitivos', () => {
    const response = ServiceOrderMapper.toResponse(makeServiceOrder());

    expect(response).toEqual({
      id: expect.any(String) as string,
      clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      description: 'Barulho no motor',
      status: ServiceOrderStatus.RECEIVED,
      cancellationReason: null,
      createdAt: expect.any(Date) as Date,
      updatedAt: expect.any(Date) as Date,
    });
  });

  it('mapeia listas preservando a ordem', () => {
    const a = makeServiceOrder();
    const b = makeServiceOrder();

    const responses = ServiceOrderMapper.toResponseList([a, b]);

    expect(responses.map((r) => r.id)).toEqual([a.getId(), b.getId()]);
  });

  it('mapeia lista vazia', () => {
    expect(ServiceOrderMapper.toResponseList([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest service-order.mapper.spec.ts`
Expected: FAIL — `Cannot find module './service-order.mapper'`.

- [ ] **Step 4: Write the implementation**

`src/modules/service-order/mappers/service-order.mapper.ts`:

```ts
import { ServiceOrderResponseDto } from '../dto/service-order.dto';
import { ServiceOrder } from '../entities/service-order.entity';

export class ServiceOrderMapper {
  static toResponse(serviceOrder: ServiceOrder): ServiceOrderResponseDto {
    return {
      id: serviceOrder.getId(),
      clientId: serviceOrder.getClientId(),
      vehicleId: serviceOrder.getVehicleId(),
      description: serviceOrder.getDescription(),
      status: serviceOrder.getStatus(),
      cancellationReason: serviceOrder.getCancellationReason(),
      createdAt: serviceOrder.getCreatedAt(),
      updatedAt: serviceOrder.getUpdatedAt(),
    };
  }

  static toResponseList(
    serviceOrders: ServiceOrder[],
  ): ServiceOrderResponseDto[] {
    return serviceOrders.map((serviceOrder) =>
      ServiceOrderMapper.toResponse(serviceOrder),
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest service-order.mapper.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/service-order/dto src/modules/service-order/mappers
git commit -m "feat: add ServiceOrder DTOs and mapper"
```

---

### Task 5: `ServiceOrderService`

**Files:**
- Create: `src/modules/service-order/services/service-order.service.ts`
- Test: `src/modules/service-order/services/service-order.service.spec.ts`

**Interfaces:**
- Consumes: `ServiceOrderRepository` (Task 3) — `create/findById/findAll/update`. `ServiceOrder` (Task 1) — `create`, `startDiagnosis/awaitApproval/awaitParts/startProgress/complete/cancel`. `OpenServiceOrderDto`, `CancelServiceOrderDto` (Task 4). `ClientService` from `src/modules/client/services/client.service.ts` — `findById(id: string): Promise<Client>` (throws `NotFoundException('Client not found')` if missing — already exists, do not modify).
- Produces: `ServiceOrderService` — `openServiceOrder(dto: OpenServiceOrderDto): Promise<ServiceOrder>`, `findById(id: string): Promise<ServiceOrder>`, `findAll(): Promise<ServiceOrder[]>`, `startDiagnosis(id: string): Promise<ServiceOrder>`, `awaitApproval(id: string): Promise<ServiceOrder>`, `awaitParts(id: string): Promise<ServiceOrder>`, `startProgress(id: string): Promise<ServiceOrder>`, `complete(id: string): Promise<ServiceOrder>`, `cancel(id: string, dto: CancelServiceOrderDto): Promise<ServiceOrder>`. Consumed by Task 6's controller.

- [ ] **Step 1: Write the failing test**

`src/modules/service-order/services/service-order.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Client } from '../../client/entities/client.entity';
import { ClientService } from '../../client/services/client.service';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';
import { ServiceOrderRepository } from '../repositories/service-order.repository';
import { ServiceOrderService } from './service-order.service';

const makeServiceOrder = (status = ServiceOrderStatus.RECEIVED) =>
  ServiceOrder.restore('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Barulho no motor',
    status,
  });

const makeClient = () =>
  Client.create({
    name: 'Maria Silva',
    document: '52998224725',
    email: 'maria@example.com',
    phone: '11999998888',
  });

type MockedRepository = { [K in keyof ServiceOrderRepository]: jest.Mock };
type MockedClientService = { [K in keyof ClientService]: jest.Mock };

describe('ServiceOrderService', () => {
  let service: ServiceOrderService;
  let repository: MockedRepository;
  let clientService: MockedClientService;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
    };
    clientService = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceOrderService,
        { provide: ServiceOrderRepository, useValue: repository },
        { provide: ClientService, useValue: clientService },
      ],
    }).compile();

    service = module.get<ServiceOrderService>(ServiceOrderService);
  });

  describe('openServiceOrder', () => {
    const dto = {
      clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      description: 'Barulho no motor',
    };

    it('abre a OS quando o cliente existe', async () => {
      clientService.findById.mockResolvedValue(makeClient());
      repository.create.mockImplementation((so: ServiceOrder) => so);

      const created = await service.openServiceOrder(dto);

      expect(created.getStatus()).toBe(ServiceOrderStatus.RECEIVED);
      expect(clientService.findById).toHaveBeenCalledWith(dto.clientId);
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('propaga NotFound quando o cliente não existe', async () => {
      clientService.findById.mockRejectedValue(
        new NotFoundException('Client not found'),
      );

      await expect(service.openServiceOrder(dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('propaga erro de domínio quando a descrição é vazia', async () => {
      clientService.findById.mockResolvedValue(makeClient());

      await expect(
        service.openServiceOrder({ ...dto, description: '' }),
      ).rejects.toThrow(DomainException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('retorna a OS encontrada', async () => {
      const serviceOrder = makeServiceOrder();
      repository.findById.mockResolvedValue(serviceOrder);

      await expect(service.findById(serviceOrder.getId())).resolves.toBe(
        serviceOrder,
      );
    });

    it('lança NotFound quando não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('delega para o repositório', async () => {
      const serviceOrders = [makeServiceOrder()];
      repository.findAll.mockResolvedValue(serviceOrders);

      await expect(service.findAll()).resolves.toBe(serviceOrders);
    });
  });

  describe.each([
    ['startDiagnosis', ServiceOrderStatus.RECEIVED, ServiceOrderStatus.IN_DIAGNOSIS],
    [
      'awaitApproval',
      ServiceOrderStatus.IN_DIAGNOSIS,
      ServiceOrderStatus.AWAITING_APPROVAL,
    ],
    [
      'awaitParts',
      ServiceOrderStatus.AWAITING_APPROVAL,
      ServiceOrderStatus.AWAITING_PARTS,
    ],
    [
      'startProgress',
      ServiceOrderStatus.AWAITING_PARTS,
      ServiceOrderStatus.IN_PROGRESS,
    ],
    ['complete', ServiceOrderStatus.IN_PROGRESS, ServiceOrderStatus.COMPLETED],
  ] as const)('%s', (method, from, expected) => {
    it(`transiciona de ${from} para ${expected} e persiste`, async () => {
      const serviceOrder = makeServiceOrder(from);
      repository.findById.mockResolvedValue(serviceOrder);
      repository.update.mockImplementation((so: ServiceOrder) => so);

      const result = await service[method](serviceOrder.getId());

      expect(result.getStatus()).toBe(expected);
      expect(repository.update).toHaveBeenCalledWith(serviceOrder);
    });

    it('lança NotFound quando a OS não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service[method]('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('propaga erro de domínio em transição inválida e não persiste', async () => {
      const serviceOrder = makeServiceOrder(ServiceOrderStatus.CANCELLED);
      repository.findById.mockResolvedValue(serviceOrder);

      await expect(service[method](serviceOrder.getId())).rejects.toThrow(
        DomainException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancela com motivo e persiste', async () => {
      const serviceOrder = makeServiceOrder(ServiceOrderStatus.RECEIVED);
      repository.findById.mockResolvedValue(serviceOrder);
      repository.update.mockImplementation((so: ServiceOrder) => so);

      const result = await service.cancel(serviceOrder.getId(), {
        reason: 'Cliente desistiu',
      });

      expect(result.getStatus()).toBe(ServiceOrderStatus.CANCELLED);
      expect(result.getCancellationReason()).toBe('Cliente desistiu');
    });

    it('lança NotFound quando a OS não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.cancel('id-inexistente', { reason: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propaga erro de domínio quando o motivo é vazio', async () => {
      const serviceOrder = makeServiceOrder(ServiceOrderStatus.RECEIVED);
      repository.findById.mockResolvedValue(serviceOrder);

      await expect(
        service.cancel(serviceOrder.getId(), { reason: '  ' }),
      ).rejects.toThrow(DomainException);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest service-order.service.spec.ts`
Expected: FAIL — `Cannot find module './service-order.service'`.

- [ ] **Step 3: Write the implementation**

`src/modules/service-order/services/service-order.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientService } from '../../client/services/client.service';
import {
  CancelServiceOrderDto,
  OpenServiceOrderDto,
} from '../dto/service-order.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderRepository } from '../repositories/service-order.repository';

@Injectable()
export class ServiceOrderService {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly clientService: ClientService,
  ) {}

  async openServiceOrder(dto: OpenServiceOrderDto): Promise<ServiceOrder> {
    await this.clientService.findById(dto.clientId);

    const serviceOrder = ServiceOrder.create({
      clientId: dto.clientId,
      vehicleId: dto.vehicleId,
      description: dto.description,
    });

    return this.serviceOrderRepository.create(serviceOrder);
  }

  async findById(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findById(id);

    if (!serviceOrder) {
      throw new NotFoundException('Service order not found');
    }

    return serviceOrder;
  }

  async findAll(): Promise<ServiceOrder[]> {
    return this.serviceOrderRepository.findAll();
  }

  async startDiagnosis(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.startDiagnosis();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async awaitApproval(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.awaitApproval();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async awaitParts(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.awaitParts();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async startProgress(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.startProgress();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async complete(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.complete();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async cancel(id: string, dto: CancelServiceOrderDto): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.cancel(dto.reason);

    return this.serviceOrderRepository.update(serviceOrder);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest service-order.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/service-order/services
git commit -m "feat: add ServiceOrderService use cases"
```

---

### Task 6: `ServiceOrderController`

**Files:**
- Create: `src/modules/service-order/controllers/service-order.controller.ts`
- Test: `src/modules/service-order/controllers/service-order.controller.spec.ts`

**Interfaces:**
- Consumes: `ServiceOrderService` (Task 5) — all methods. `ServiceOrderMapper.toResponse/toResponseList` (Task 4). `OpenServiceOrderDto`, `CancelServiceOrderDto`, `ServiceOrderResponseDto` (Task 4).
- Produces: `ServiceOrderController` registered under route `service-order`, with the 8 endpoints listed below. Consumed by Task 7's module.

- [ ] **Step 1: Write the failing test**

`src/modules/service-order/controllers/service-order.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderService } from '../services/service-order.service';
import { ServiceOrderController } from './service-order.controller';

const makeServiceOrder = () =>
  ServiceOrder.create({
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Barulho no motor',
  });

describe('ServiceOrderController', () => {
  let controller: ServiceOrderController;
  let service: { [K in keyof ServiceOrderService]: jest.Mock };

  beforeEach(async () => {
    service = {
      openServiceOrder: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      startDiagnosis: jest.fn(),
      awaitApproval: jest.fn(),
      awaitParts: jest.fn(),
      startProgress: jest.fn(),
      complete: jest.fn(),
      cancel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceOrderController],
      providers: [{ provide: ServiceOrderService, useValue: service }],
    }).compile();

    controller = module.get<ServiceOrderController>(ServiceOrderController);
  });

  it('openServiceOrder devolve o DTO mapeado', async () => {
    const serviceOrder = makeServiceOrder();
    service.openServiceOrder.mockResolvedValue(serviceOrder);
    const dto = {
      clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      description: 'Barulho no motor',
    };

    const response = await controller.openServiceOrder(dto);

    expect(service.openServiceOrder).toHaveBeenCalledWith(dto);
    expect(response.id).toBe(serviceOrder.getId());
    expect(response.status).toBe('RECEIVED');
  });

  it('findAll mapeia a lista inteira', async () => {
    service.findAll.mockResolvedValue([makeServiceOrder(), makeServiceOrder()]);

    const response = await controller.findAll();

    expect(response).toHaveLength(2);
  });

  it('findById delega o id para o service', async () => {
    const serviceOrder = makeServiceOrder();
    service.findById.mockResolvedValue(serviceOrder);

    const response = await controller.findById(serviceOrder.getId());

    expect(service.findById).toHaveBeenCalledWith(serviceOrder.getId());
    expect(response.id).toBe(serviceOrder.getId());
  });

  it.each([
    ['startDiagnosis', 'startDiagnosis'],
    ['awaitApproval', 'awaitApproval'],
    ['awaitParts', 'awaitParts'],
    ['startProgress', 'startProgress'],
    ['complete', 'complete'],
  ] as const)('%s delega o id para o service', async (method, serviceMethod) => {
    const serviceOrder = makeServiceOrder();
    service[serviceMethod].mockResolvedValue(serviceOrder);

    const response = await controller[method](serviceOrder.getId());

    expect(service[serviceMethod]).toHaveBeenCalledWith(serviceOrder.getId());
    expect(response.id).toBe(serviceOrder.getId());
  });

  it('cancel repassa id e dto', async () => {
    const serviceOrder = makeServiceOrder();
    service.cancel.mockResolvedValue(serviceOrder);

    await controller.cancel(serviceOrder.getId(), { reason: 'Motivo' });

    expect(service.cancel).toHaveBeenCalledWith(serviceOrder.getId(), {
      reason: 'Motivo',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest service-order.controller.spec.ts`
Expected: FAIL — `Cannot find module './service-order.controller'`.

- [ ] **Step 3: Write the implementation**

`src/modules/service-order/controllers/service-order.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CancelServiceOrderDto,
  OpenServiceOrderDto,
  ServiceOrderResponseDto,
} from '../dto/service-order.dto';
import { ServiceOrderMapper } from '../mappers/service-order.mapper';
import { ServiceOrderService } from '../services/service-order.service';

@ApiTags('service-order')
@Controller('service-order')
export class ServiceOrderController {
  constructor(private readonly serviceOrderService: ServiceOrderService) {}

  @Post()
  @ApiOperation({ summary: 'Abre uma ordem de serviço' })
  @ApiCreatedResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Campos obrigatórios ausentes' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async openServiceOrder(
    @Body() dto: OpenServiceOrderDto,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.openServiceOrder(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lista as ordens de serviço' })
  @ApiOkResponse({ type: ServiceOrderResponseDto, isArray: true })
  async findAll(): Promise<ServiceOrderResponseDto[]> {
    return ServiceOrderMapper.toResponseList(
      await this.serviceOrderService.findAll(),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma ordem de serviço por id' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.findById(id),
    );
  }

  @Patch(':id/start-diagnosis')
  @ApiOperation({ summary: 'Inicia o diagnóstico da OS' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async startDiagnosis(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.startDiagnosis(id),
    );
  }

  @Patch(':id/await-approval')
  @ApiOperation({ summary: 'Coloca a OS aguardando aprovação do orçamento' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async awaitApproval(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.awaitApproval(id),
    );
  }

  @Patch(':id/await-parts')
  @ApiOperation({ summary: 'Coloca a OS aguardando peças' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async awaitParts(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.awaitParts(id),
    );
  }

  @Patch(':id/start-progress')
  @ApiOperation({ summary: 'Inicia a execução do serviço' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async startProgress(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.startProgress(id),
    );
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Finaliza a OS' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.complete(id),
    );
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancela a OS' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({
    description: 'Transição de status inválida ou motivo ausente',
  })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelServiceOrderDto,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.cancel(id, dto),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest service-order.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/service-order/controllers
git commit -m "feat: add ServiceOrderController endpoints"
```

---

### Task 7: `ServiceOrderModule` and app wiring

**Files:**
- Create: `src/modules/service-order/service-order.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `ServiceOrderController` (Task 6), `ServiceOrderService` (Task 5), `ServiceOrderRepository` (Task 3), `ClientModule` from `src/modules/client/client.module.ts` (already exists, exports `ClientService`).
- Produces: `ServiceOrderModule`, imported by `AppModule` — no new interface consumed by later tasks other than the running app itself (verified via e2e in Task 8).

- [ ] **Step 1: Create the module**

`src/modules/service-order/service-order.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ClientModule } from '../client/client.module';
import { ServiceOrderController } from './controllers/service-order.controller';
import { ServiceOrderRepository } from './repositories/service-order.repository';
import { ServiceOrderService } from './services/service-order.service';

@Module({
  imports: [ClientModule],
  controllers: [ServiceOrderController],
  providers: [ServiceOrderService, ServiceOrderRepository],
  exports: [ServiceOrderService],
})
export class ServiceOrderModule {}
```

- [ ] **Step 2: Register it in `AppModule`**

Modify `src/app.module.ts`: add the import statement

```ts
import { ServiceOrderModule } from './modules/service-order/service-order.module';
```

next to the existing `import { ClientModule } from './modules/client/client.module';`, and add `ServiceOrderModule` to the `imports` array, right after `ClientModule`:

```ts
    PrismaModule,
    ClientModule,
    ServiceOrderModule,
```

- [ ] **Step 3: Verify the app still boots and compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx jest`
Expected: all existing + new unit test suites PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/service-order/service-order.module.ts src/app.module.ts
git commit -m "feat: register ServiceOrderModule"
```

---

### Task 8: `InMemoryServiceOrderRepository` + e2e tests

**Files:**
- Create: `test/in-memory-service-order.repository.ts`
- Create: `test/service-order.e2e-spec.ts`

**Interfaces:**
- Consumes: `ServiceOrder` (Task 1), `ServiceOrderRepository` (Task 3, overridden in the Nest testing module), `InMemoryClientRepository` from `test/in-memory-client.repository.ts` (already exists), `configureApp` from `src/setup-app.ts`, `AppModule` from `src/app.module.ts`.
- Produces: nothing consumed elsewhere — this is the final, top-level verification task.

- [ ] **Step 1: Create the in-memory repository test double**

`test/in-memory-service-order.repository.ts`:

```ts
import { ServiceOrder } from '../src/modules/service-order/entities/service-order.entity';

export class InMemoryServiceOrderRepository {
  private readonly serviceOrders = new Map<string, ServiceOrder>();

  create(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    this.serviceOrders.set(serviceOrder.getId(), serviceOrder);

    return Promise.resolve(serviceOrder);
  }

  findById(id: string): Promise<ServiceOrder | null> {
    return Promise.resolve(this.serviceOrders.get(id) ?? null);
  }

  findAll(): Promise<ServiceOrder[]> {
    return Promise.resolve(
      Array.from(this.serviceOrders.values()).sort(
        (a, b) => b.getCreatedAt().getTime() - a.getCreatedAt().getTime(),
      ),
    );
  }

  update(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    this.serviceOrders.set(serviceOrder.getId(), serviceOrder);

    return Promise.resolve(serviceOrder);
  }
}
```

- [ ] **Step 2: Write the e2e test**

`test/service-order.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { ServiceOrderRepository } from '../src/modules/service-order/repositories/service-order.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';

const clientPayload = {
  name: 'Maria Silva',
  document: '529.982.247-25',
  email: 'maria@example.com',
  phone: '(11) 99999-8888',
};

const openPayload = (clientId: string) => ({
  clientId,
  vehicleId: 'a1b2c3d4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  description: 'Barulho no motor ao acelerar',
});

describe('ServiceOrder (integração)', () => {
  let app: INestApplication<App>;
  let http: App;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ClientRepository)
      .useValue(new InMemoryClientRepository())
      .overrideProvider(ServiceOrderRepository)
      .useValue(new InMemoryServiceOrderRepository())
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  const createClient = async (): Promise<string> => {
    const response = await request(http)
      .post('/api/v1/client')
      .send(clientPayload)
      .expect(201);

    return response.body.id as string;
  };

  const open = (body: Record<string, unknown>) =>
    request(http).post('/api/v1/service-order').send(body);

  describe('POST /api/v1/service-order', () => {
    it('abre a OS com status RECEIVED', async () => {
      const clientId = await createClient();

      const response = await open(openPayload(clientId)).expect(201);

      expect(response.body).toMatchObject({
        clientId,
        status: 'RECEIVED',
        cancellationReason: null,
      });
      expect(response.body).toHaveProperty('id');
    });

    it('devolve 404 quando o cliente não existe', async () => {
      await open(
        openPayload('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c'),
      ).expect(404);
    });

    it('devolve 400 quando a descrição está vazia', async () => {
      const clientId = await createClient();

      await open({ ...openPayload(clientId), description: '' }).expect(400);
    });

    it('devolve 400 para campo desconhecido no corpo', async () => {
      const clientId = await createClient();

      await open({ ...openPayload(clientId), admin: true }).expect(400);
    });
  });

  describe('GET /api/v1/service-order', () => {
    it('lista vazia quando não há OS', async () => {
      const response = await request(http)
        .get('/api/v1/service-order')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('lista as OS abertas', async () => {
      const clientId = await createClient();
      await open(openPayload(clientId)).expect(201);

      const response = await request(http)
        .get('/api/v1/service-order')
        .expect(200);

      expect(response.body).toHaveLength(1);
    });
  });

  describe('GET /api/v1/service-order/:id', () => {
    it('busca por id', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      const response = await request(http)
        .get(`/api/v1/service-order/${created.id}`)
        .expect(200);

      expect(response.body.id).toBe(created.id);
    });

    it('devolve 404 para id inexistente', async () => {
      await request(http)
        .get('/api/v1/service-order/f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c')
        .expect(404);
    });

    it('devolve 400 para id que não é uuid', async () => {
      await request(http)
        .get('/api/v1/service-order/nao-e-uuid')
        .expect(400);
    });
  });

  describe('fluxo de transição de status', () => {
    const advance = (
      id: string,
      action: string,
      body: Record<string, unknown> = {},
    ) => request(http).patch(`/api/v1/service-order/${id}/${action}`).send(body);

    it('percorre o fluxo feliz até COMPLETED', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'start-diagnosis').expect(200);
      await advance(created.id, 'await-approval').expect(200);
      await advance(created.id, 'start-progress').expect(200);
      const response = await advance(created.id, 'complete').expect(200);

      expect(response.body.status).toBe('COMPLETED');
    });

    it('percorre o fluxo com peças até COMPLETED', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'start-diagnosis').expect(200);
      await advance(created.id, 'await-approval').expect(200);
      await advance(created.id, 'await-parts').expect(200);
      const response = await advance(created.id, 'start-progress').expect(200);

      expect(response.body.status).toBe('IN_PROGRESS');
    });

    it('devolve 400 ao pular etapa da transição', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'complete').expect(400);
    });

    it('cancela com motivo', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      const response = await advance(created.id, 'cancel', {
        reason: 'Cliente desistiu',
      }).expect(200);

      expect(response.body.status).toBe('CANCELLED');
      expect(response.body.cancellationReason).toBe('Cliente desistiu');
    });

    it('devolve 400 ao cancelar sem motivo', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'cancel', {}).expect(400);
    });

    it('devolve 404 ao avançar OS inexistente', async () => {
      await advance(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        'start-diagnosis',
      ).expect(404);
    });
  });
});
```

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e -- --testPathPattern=service-order`
Expected: PASS (all `describe` blocks green). If the shell doesn't support the inline `LOG_LEVEL=silent` syntax from the `test:e2e` script (Windows cmd/PowerShell without a POSIX shell), run directly instead: `npx jest --config ./test/jest-e2e.json service-order.e2e-spec.ts`.

- [ ] **Step 4: Run the full test suite with coverage**

Run: `npx jest --coverage`
Expected: PASS, coverage thresholds (80% branches/functions/lines/statements) met — the new module follows the exact same shape as `client`, which already meets them.

- [ ] **Step 5: Commit**

```bash
git add test/in-memory-service-order.repository.ts test/service-order.e2e-spec.ts
git commit -m "test: add ServiceOrder e2e coverage"
```

---

## Self-Review Notes

- **Spec coverage:** every task 22–34 from the board maps to a task above — aggregate (Task 1), enum + transitions (Task 1), repository contract (Task 3), Abrir/Consultar OS (Task 5 `openServiceOrder`/`findById`/`findAll`), Iniciar Diagnóstico/Aguardar Aprovação/Aguardar Peças/Iniciar Serviço/Finalizar OS/Cancelar OS (Task 5, one method each), unit tests (Tasks 1, 3–6).
- **Type consistency:** `ServiceOrderStatus` values, `ServiceOrderProps` shape, and repository/service/controller method names are identical across all tasks (checked against each "Interfaces" block).
- **Scope:** single aggregate, no cross-module coupling beyond the existing `ClientModule`/`ClientService` — matches the spec's explicit exclusion of Vehicle/Diagnosis/Budget/Stock/Payment modules.
