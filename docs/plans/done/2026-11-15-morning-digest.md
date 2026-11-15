---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer and the reviewer confirms they have looked at it.

Review clarification from the course: keep the preview issue open while review is pending.
Acknowledgment that the link was sent is not confirmation that the review happened.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Issues

- [#1 — Read and aggregate nightly run logs](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/issues/1)
- [#2 — Render the nightly digest page](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/issues/2)
- [#3 — Expose the nightly digest as JSON](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/issues/3)
- [#4 — Link recorded nights from the status board](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/issues/4)
- [#5 — Test digest HTML and JSON routes](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/issues/5)
- [#6 — Publish an HTML preview for review](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/issues/6)
- [#7 — Remove the preview marker and archive the plan](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/issues/7)

## Completion record

The course reviewer confirmed they had seen the marked preview. The clean deployment run
[43731009930](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/actions/runs/43731009930)
replaced the same public URL, which now returns HTTP 200 with the `no marker set` banner and
the five expected jobs: `digest/render`, `fixtures/refresh`, `lane/sync`, `notes/backup`, and
`rig/rotate-logs`. The course accepted S01E04 on 2026-11-15 after the final submission.
The [debrief](https://hq.mega.dev/challenges/before-i-looked#debrief) is saved on the course page.
