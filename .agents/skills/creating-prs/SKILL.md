---
name: creating-prs
description: Use when preparing, opening, updating, or reviewing a pull request description for this repository.
---

# Creating PRs

## Overview

Create pull requests from the actual branch diff, not from memory. The PR body must use `.github/pull_request_template.md`, and checklist items may be checked only when verified.

## Required Workflow

1. Read `.github/pull_request_template.md` before drafting the PR.
2. Inspect the real change set with `git status`, `git log <base>..HEAD`, and `git diff --stat <base>..HEAD`.
3. Fill every template section with concrete information from the diff, commits, tests, and known limitations.
4. Verify each checklist item before marking it with `[x]`.
5. Run the commands listed in the template's test section, or leave the item unchecked and explain why it could not be run.
6. Create or update the PR only after the filled template is consistent with the verified evidence.

## Checklist Rules

Treat the checklist as evidence, not aspiration:

| Template item asks about | Evidence before `[x]` |
| --- | --- |
| Scope coherence | Diff and commit list match the PR title and summary |
| Tests | Relevant unit, e2e, build, or validation commands were run successfully |
| Documentation or Swagger | The diff contains the applicable docs, DTO, decorator, or generated contract changes |
| Prisma, schema, migrations, or infra | Schema and migration changes were inspected and validated where possible |
| Regression risk | A short risk/impact pass was done against touched modules and public behavior |

If evidence is partial, keep the checkbox unchecked and add the reason in `Observacoes`.

## PR Body Guidance

- `Resumo`: one short paragraph describing the user-visible or domain outcome.
- `Alteracoes`: bullets grouped by actual changed areas, not a restatement of every file.
- `Tipo de mudanca`: check only categories supported by the diff.
- `Como testar`: include exact commands and whether they passed.
- `Observacoes`: include blocked checks, environment limitations, migrations not applied, or known follow-up work.

## Common Mistakes

- Marking the whole checklist because the implementation "looks done".
- Reusing an old PR body after the branch changed.
- Listing commands that were planned but not actually run.
- Creating the PR before confirming the base branch and remote branch.
- Omitting failed, skipped, or environment-blocked verification from `Observacoes`.
