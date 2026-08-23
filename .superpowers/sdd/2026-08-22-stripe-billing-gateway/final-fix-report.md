# Final Fix Report

Date: 2026-08-22
Starting HEAD: `895212373b0d2fcd6abe2a7a7615e94e58a279d5`
Implementation commit: `e001fd2` (`fix: harden Stripe billing final review paths`)

## Status

All supplied final-review findings were addressed in one fix wave. The unrelated
dirty package files, pull request template, historical standardization migration,
untracked `.agents/` content, and untracked implementation plan were preserved and
not included in the implementation commit.

## Changes

### Migration safety and legacy data

- Wrapped `20260822010000_align_billing_gateway` in an explicit transaction.
- Added a first-step guard that aborts when a legacy billing is
  `PARTIALLY_PAID`, or has `paidCents > 0` while not `PAID`. The guard runs
  before enum conversion, legacy column removal, or `billing_payment` removal.
- Made Budget history normalization robust by dropping
  `budget_serviceOrderId_fkey` with `IF EXISTS`, converting
  `budget.serviceOrderId` to `TEXT` with an explicit cast, and only then running
  the Budget-to-Billing backfill.
- Added staged target enums and columns so fully paid rows retain useful data
  before destructive DDL.
- Migrated the latest legacy payment row for each `PAID` billing into
  `paymentMethod` and `paidAt`. `CREDIT_CARD`, `DEBIT_CARD`, and
  `BANK_TRANSFER` map to `CARD`; `PIX` maps to `PIX`; `CASH` maps to `CASH`.
  A paid billing without a payment row remains paid with nullable metadata.
- Dropped the legacy payment table and money columns only after validation and
  metadata backfill.
- Expanded migration contract tests to verify transaction boundaries, Budget
  UUID/FK normalization, partial-payment abort ordering, staged backfill,
  latest paid metadata mapping, and destructive DDL ordering.

### Stripe and Billing behavior

- Added the stable Stripe Checkout idempotency key
  `billing-payment-link:<billingId>` as the second Checkout Session creation
  argument.
- Added a BillingService retry regression where Stripe succeeds, optimistic
  persistence fails, and a second request recovers the persisted pending billing.
- Hardened webhook concurrency: after an optimistic update loss, BillingService
  reloads by gateway transaction ID and accepts the duplicate when the stored
  billing is already `PAID` for that same transaction. Other concurrent changes
  still return conflict.
- Added a concurrent duplicate webhook test using distinct aggregate instances.

### Webhook validation and documentation

- Missing and blank `stripe-signature` headers now return a controlled
  `BadRequestException` before invoking BillingService.
- Stripe signature verification failures are translated by the adapter into a
  gateway-specific error and then into `BadRequestException`; unrelated Stripe
  failures still propagate unchanged.
- Added controller, service, and gateway coverage for signature failures.
- Corrected README success and cancel examples to client routes and explicitly
  documented that they are configurable frontend URLs, not API endpoints.

## TDD Evidence

- Focused unit regression run failed with six expected failures covering missing
  signature validation, webhook optimistic-race recovery, missing controlled
  signature error, and missing Checkout idempotency options.
- Focused migration contract run failed with four expected failures covering
  Budget type/FK normalization, partial-payment protection, paid metadata
  staging, and transaction boundaries.
- After implementation, the focused unit run passed 23 tests and the migration
  contract run passed 7 tests.

## Verification

- `npm.cmd test -- billing`: PASS, 7 suites / 38 tests.
- `npm.cmd run test:e2e -- billing`: PASS, 1 suite / 3 tests.
- `npm.cmd run test:e2e -- prisma-schema --runInBand`: PASS, 1 suite / 7 tests.
- `npm.cmd run build`: PASS.
- `npx.cmd prisma validate`: PASS; schema is valid.
- `npm.cmd test`: PASS, 55 suites / 504 tests.
- Scoped `git diff --check`: PASS.

## Migration Replay

Docker was unavailable because the Docker Desktop daemon was not running. A
disposable local Prisma PostgreSQL server was started instead. Prisma
`migrate deploy` exited with a bare schema-engine error against that helper, so
the same PostgreSQL database was replayed directly by applying every checked-in
`migration.sql` file in timestamp order. All 11 migrations, including
`20260821003050_standardize_uuid_money_enums` in its current dirty working-tree
form and `20260822010000_align_billing_gateway`, applied successfully.

Additional isolated live-data scenarios could not be run because the local
Prisma server exposed one effective database and a second custom-port instance
did not start. The disposable Prisma instances were stopped and removed. The
UUID/FK history path, partial-payment abort, paid metadata migration, and DDL
ordering are covered by the focused migration SQL contract tests.

## Concerns

- `prisma migrate deploy` itself was not successfully exercised because of the
  local Prisma development server schema-engine error; direct PostgreSQL SQL
  replay is the available migration execution evidence.
- The historical migration
  `20260821003050_standardize_uuid_money_enums/migration.sql` was already dirty
  and currently keeps `budget.serviceOrderId` as external `TEXT`. It was not
  modified or committed. The new migration remains defensive for either that
  history or the reviewed UUID/FK variant.
- The unrelated pull request template still contains pre-existing trailing
  whitespace, so an unscoped `git diff --check` reports that dirty file. All
  scoped final-fix files pass `git diff --check`.
