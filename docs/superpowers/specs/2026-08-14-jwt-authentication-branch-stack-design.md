# JWT authentication branch stack

## Objective

Replace the oversized `feat/jwt-authentication` branch with a stack of focused
branches. Each branch must be based on its predecessor and must change no more
than 15 files relative to that predecessor.

## Branch order

1. `feat/identity-schema-seeding` (from `main`)
   - Prisma identity schema, migration, dependencies and initial administrator
     seed.
   - Nine files.
2. `feat/identity-services` (from `feat/identity-schema-seeding`)
   - Identity entities, repositories, password hashing and login-credential
     value object.
   - Twelve files.
3. `feat/auth-sessions` (from `feat/identity-services`)
   - JWT login, refresh-session lifecycle, DTOs, module wiring and unit tests.
   - Eight files.
4. `feat/auth-authorization-http` (from `feat/auth-sessions`)
   - JWT strategy, guards, role and current-user decorators, and HTTP module
     wiring.
   - Thirteen files.
5. `test/auth-integration-docs` (from `feat/auth-authorization-http`)
   - E2E support, authentication and Swagger integration tests, and usage
     documentation.
   - Six files.
6. `chore/auth-production-hardening` (from `test/auth-integration-docs`)
   - Production credentials, seed startup, Docker support, environment sample
     and the associated documentation updates.
   - Six files.

## Implementation rules

- Preserve the final behavior of `feat/jwt-authentication`.
- Split mixed commits by concern; do not merely replay their existing commit
  boundaries.
- Keep each branch independently reviewable and testable given its parent.
- Leave the existing `feat/jwt-authentication` branch untouched; the new,
  explicitly named branches replace it for review and merge purposes.

## Verification

For each branch, compare its diff against its direct parent and count changed
paths. At the top of the stack, compare against the original branch to confirm
that the effective source changes match. Run the applicable unit and E2E tests
after the stack is assembled.
