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

The `client` module is the reference for the Clean Architecture migration:

- `domain/entities/` and `domain/value-objects/`: business rules, without Nest,
  HTTP, Prisma, or application dependencies.
- `application/use-cases/`: pure use cases exposing `execute`, with typed
  inputs/results in `application/contracts/`.
- `application/ports/`: framework-independent persistence and integration
  contracts; application depends on these, never concrete adapters.
- `application/errors/`: pure errors translated at the HTTP boundary.
- `infrastructure/persistence/`: Prisma repository and persistence mapper.
- `infrastructure/identity/`: adapter to the existing identity subsystem.
- `presentation/http/`: controllers, DTOs, response mappers, and error filters.
- `<feature>.module.ts`: Nest composition through providers and factories.

Use cases are tested through direct instantiation with fake ports. Keep DTO
validation/Swagger at the HTTP boundary. Preserve the existing API contracts.
Run the client architecture boundary test with the unit suite.

Other modules still use the following legacy layout; migrate them only when
the active plan requests it:

- `entities/`: domain model, invariants, state transitions, and value behavior.
- `dto/`: request and response contracts, validation, and Swagger metadata.
- `mappers/`: conversions between domain, persistence records, and API
  responses.
- `repositories/`: Prisma persistence access.
- `services/`: application use cases and orchestration.
- `controllers/`: HTTP routing only.
- `<feature>.module.ts`: Nest module wiring.

Controllers should stay thin. They handle routing concerns and delegate to
services.

Use cases (or services in legacy modules) coordinate operations, load
aggregates through repositories, call domain behavior, and persist changes.

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
