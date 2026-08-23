# Task 1 Report: Do Not Round Penalty Up

## Status

DONE

## Implementation

- Changed overdue-day calculation from `Math.ceil` to `Math.floor`, so only completed 24-hour periods count.
- Changed fixed penalty and prorated interest cent calculations from `Math.round` to `Math.floor`.
- Preserved integer-cent `Money` values, the existing 30-day commercial-month formula, and zero-penalty behavior when there is no completed overdue day.

## Tests

Updated `src/modules/billing/value-objects/penalty.vo.spec.ts` with coverage for:

- exactly one completed overdue day;
- just under one completed overdue day;
- just under forty completed overdue days;
- truncation of fractional fixed-penalty cents;
- existing no-overdue and 30-day interest behavior.

Verification performed:

- `npm.cmd test -- --runInBand modules/billing/value-objects/penalty.vo.spec.ts`: 1 suite passed, 6 tests passed.
- `npm.cmd test -- --runInBand modules/billing`: 8 suites passed, 55 tests passed.
- `git diff --check`: passed; only standard LF/CRLF conversion warnings were reported.

The TDD red phase confirmed the new tests failed against the previous `ceil`/`round` implementation before the production change.

## Scope and Concerns

Only the Billing Penalty value object, its unit tests, and this report were changed. The pre-existing `.env.sample` modification was preserved and excluded from the commit. No concerns identified.

## Commit

Recorded in the task commit created after verification.
