# 0002 · Plans are files, work is issues

- Status: accepted · 2026-10-13 · amended by 0004 (issues as files when GitHub's can't be reached)

## Context

Plans written into chat vanish with the session. Plans written into one big issue get worked
top to bottom by a single agent, including the parts that should have waited.

## Decision

- A plan is a file, `plan.md` at the root, reviewed like code. Finished plans move to
  `docs/plans/done/` with their issue list.
- Work happens in GitHub issues split from the plan (skill `plan-to-issues`), one per unit of
  work, each with its source section, scope, a checkable done condition, and what it's blocked by.
- Issues are worked by workers, one issue each. The closing comment records which model did it
  (format in AGENTS.md), so we can see later which models are worth their cost per kind of task.

## Consequences

- Anyone, human or agent, picks up a plan cold from the repo alone.
- The split is the plan's real review. A bad split is a bad plan.

## Approved issue contract

The student approved these fields during the morning-digest split review:

- Start the body with `Source: plan.md § <section>`.
- Include `Scope`, `Done when`, `Blocked by`, and `Validation` sections.
- Apply `plan:morning-digest` to issues for this plan.
- Use real issue numbers for dependencies and checkable evidence for each done condition.
- Record the worker, model, effort and commit in the closing comment specified by `AGENTS.md`.

A preview issue that waits for an external reviewer stays open until that reviewer confirms
they have looked. Link submission alone does not meet that condition. Cleanup waits for
that review and the separate human approval to overwrite the public page. These conditions
incorporate the course feedback received during this plan's execution.
