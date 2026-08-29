---
name: api-insomnia-report
description: Use when preparing this API project's Insomnia export, OpenAPI evidence, OWASP ZAP outputs, or final API testing/security report.
---

# API Insomnia Report

## Overview

Use this skill to turn the Oficina FIAP API into deliverable testing artifacts:
an Insomnia collection, OpenAPI evidence, optional OWASP ZAP scan output, and a
clear report that explains what was tested and what the results mean.

Keep the work grounded in files that already exist in this repository. Do not
invent endpoints, credentials, vulnerabilities, or test results.

## Project Artifacts

Prefer these existing paths:

| Artifact | Path |
| --- | --- |
| Insomnia generator | `docs/insomnia/generate-insomnia.js` |
| OpenAPI snapshot | `docs/insomnia/openapi.json` |
| Insomnia export | `docs/insomnia/oficina-fiap-api.insomnia.json` |
| ZAP templates/reports | `.zap-output/` |
| API docs endpoint | `/api/v1/docs-json` |
| Health endpoint | `/api/v1/health` |

The current npm script for generating the Insomnia export is:

```bash
npm run insomnia:export
```

That script builds the NestJS app, reads Swagger/OpenAPI from the app, writes
`docs/insomnia/openapi.json`, and writes
`docs/insomnia/oficina-fiap-api.insomnia.json`.

## Authentication Rules

The Insomnia environment uses `token` for the access token:

```http
Authorization: Bearer {{ _.token }}
```

Only put the `accessToken` in `token`. Do not put the `refreshToken` in the
Authorization header for protected API routes; that returns `401` by design.

Use refresh tokens only with:

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{ "refreshToken": "<refreshToken>" }
```

After refresh, update both local values: the new `accessToken` goes into
`token`, and the new `refreshToken` replaces the previous refresh token.

## Workflow

1. Check the working tree first with `git status --short --branch`. Preserve
   unrelated user changes.
2. If the request asks to regenerate the Insomnia JSON, run
   `npm run insomnia:export`. If that fails because dependencies or generated
   Prisma files are missing, report the exact command and failure before
   changing unrelated files.
3. Inspect the generated export enough to confirm:
   - protected requests use `Authorization: Bearer {{ _.token }}`;
   - auth login/refresh/logout requests are present;
   - the base environment has `base_url`;
   - request count or endpoint groups match the current OpenAPI document.
4. If the request involves OWASP ZAP, use the files under `.zap-output/`.
   Replace placeholder auth tokens only in a copy or generated run file unless
   the user explicitly asks to edit the template.
5. Build the report from actual evidence: commands run, generated files,
   endpoint coverage, auth behavior, status codes, ZAP alert counts, and any
   known limitations.

## Report Shape

For a final report, use this structure unless the user provides a template:

```markdown
# Oficina FIAP API - Test and Security Evidence Report

## Scope
[API base URL, branch/commit if available, and artifacts reviewed.]

## Artifacts
- Insomnia export: `docs/insomnia/oficina-fiap-api.insomnia.json`
- OpenAPI snapshot: `docs/insomnia/openapi.json`
- ZAP report: `.zap-output/<file>` when present

## Authentication
[Explain accessToken vs refreshToken and how protected routes are called.]

## Endpoint Coverage
[Summarize endpoint groups and notable protected/public routes.]

## Execution Evidence
[Commands run and results. Include failures plainly.]

## Findings
[Security/test findings based only on observed evidence.]

## Limitations
[Anything not executed, not authenticated, or not covered.]

## Conclusion
[Short delivery-ready summary.]
```

## Common Mistakes

| Mistake | Correction |
| --- | --- |
| Using `refreshToken` in `Authorization` | Use `accessToken` as `Bearer {{ _.token }}` and call `/auth/refresh` separately. |
| Editing generated Insomnia JSON by hand first | Prefer changing Swagger metadata or `docs/insomnia/generate-insomnia.js`, then regenerate. |
| Reporting ZAP findings without reading the report file | Inspect the HTML/JSON output or say the scan was not reviewed. |
| Claiming all endpoints were tested from export generation alone | Export generation proves documentation coverage, not execution success. |

## Verification

Before saying the deliverable is ready, verify at least one concrete artifact:

```bash
npm run insomnia:export
```

If Python is available, validate generated JSON shape with a parser instead of
manual string checks. If no runtime is available, inspect the JSON with shell
commands and state that full execution was not run.
