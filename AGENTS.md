# AGENTS.md

## Project

This is a NestJS 11 API using Prisma 7, PostgreSQL, Jest, class-validator,
and Swagger.

## Workflow

- Prefer following the Clean Architecture pattern under `src/modules/client`.
- For implementation plans in `docs/superpowers/plans`, use
  `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
- Follow TDD when a plan asks for failing tests first.
- Keep implementation scoped to the active plan or user request.
- Do not skip verification commands requested by the plan.
- When preparing a pull request description, follow
  `.github/pull_request_template.md` and fill in summary, changes, tests, and
  observations based on the actual diff.

## Commands

- Unit tests: `npm test`
- E2E tests: `npm run test:e2e`
- Build: `npm run build`
- Prisma migration: `npx prisma migrate dev --name <name>`

## Architecture

This project follows a modular NestJS architecture organized by business
capability.

Every module under `src/modules` follows Clean Architecture (the `client`
module was the reference during the migration):

- `domain/entities/`, `domain/value-objects/`, `domain/enums/`: business rules,
  without Nest, HTTP, Prisma, or application dependencies.
- `application/use-cases/`: pure use cases exposing `execute`, with typed
  inputs/results in `application/contracts/`. Code shared by several use cases
  of the same module lives in `application/services/`.
- `application/ports/`: framework-independent persistence and integration
  contracts; application depends on these, never concrete adapters. A module
  never imports another module's `application/`: it declares a narrow port and
  an adapter in `infrastructure/integrations/` calls the other module's
  exported use case.
- `application/errors/`: `<Module>ApplicationError extends ApplicationError`
  (`src/shared/application`) with typed codes and a semantic `kind`; the single
  global `ApplicationExceptionFilter` (`src/shared/http/filters`) maps `kind` to
  the HTTP status. Modules never define their own HTTP filter.
- `infrastructure/persistence/`: Prisma repository and persistence mapper.
- `infrastructure/<integrations|notifications|payment|jwt|...>/`: adapters for
  the ports (other modules' use cases, e-mail templates, Stripe, JWT).
- `presentation/http/`: controllers, DTOs and response mappers.
- `<feature>.module.ts`: Nest composition through providers and factories; a
  module exports only use cases.

`src/shared/identity` (users, refresh sessions, password hashing) has the same
layers and exposes only ports through `IdentityModule`.

Use cases are tested through direct instantiation with fake ports. Keep DTO
validation/Swagger at the HTTP boundary. Preserve the existing API contracts.
`src/architecture.spec.ts` (with `test/architecture/`) enforces the import
boundaries for every module under `src/modules` (domain and application
framework-free; infrastructure and presentation reach other modules only
through their `domain/` and `application/`), checks `shared/`, and requires
the module graph to be acyclic without `forwardRef`.

Controllers should stay thin. They handle routing concerns and delegate to
use cases.

Use cases coordinate operations, load aggregates through repository ports,
call domain behavior, and persist changes.

Entities should own business rules. State transitions, invariants, immutable
fields, and derived values belong in the domain model, not in controllers,
services, or repositories.

Repositories should not contain business decisions. They translate between
Prisma and the domain model.

Mappers are boundary glue: domain to persistence, persistence to domain, and
domain to response DTOs.

## Domain Boundaries

Do not create cross-module domain dependencies unless the feature explicitly
requires it.

For the Budget MVP, `serviceOrderId` is an external string reference. Do not
create a ServiceOrder/Service module, Prisma relation, or existence check
unless a later plan asks for that integration.

## Conventions

- Keep domain rules in entity classes.
- Use DTOs with `class-validator` and Swagger decorators.
- Use Prisma repositories for persistence.
- Do not accept calculated totals from request bodies.
- Preserve the MVP scope unless the active plan says otherwise.
