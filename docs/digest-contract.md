# Nightly digest contract

Source: [issue #1](https://github.com/SzyMan1337/mega-dev-s01e04-before-i-looked/issues/1),
`plan.md` section 1 and the reviewed issue split.

Import `DigestStatus`, `DigestRow`, `DigestNight` and `ReadNight` as types from
`src/digest/types.ts` (use `.js` import specifiers in TypeScript, as elsewhere in rig).
The stable runtime import is the named `readNight` export from
`src/digest/read-night.ts` (`./digest/read-night.js` from `src/app.tsx`).
Its synchronous signature is:

```ts
readNight(runsDir: string, night: string): DigestNight | null
```

The initial contract commit exports only types, including the `ReadNight` function
type. The runtime module arrives in the reader implementation commit; there is no
placeholder function to call before then. All board, page and API consumers use
this reader, with no duplicate log parser.

- `night` must be exactly ten characters in `YYYY-MM-DD` form. Invalid locators
  throw `RangeError` before filesystem access. This is a filename check, not a
  calendar lookup. The reader opens only `<runsDir>/<night>.jsonl`.
- A missing file (`ENOENT`) returns `null`. Other I/O errors propagate. An existing
  empty or blank file returns `{ night, rows: [], badLines: 0, counts: { ok: 0,
  retry: 0, fail: 0 } }`.
- Each nonblank line must contain a JSON object with required `at` and `job`
  strings, `status` equal to `ok`, `retry` or `fail`, and `owner` a string or
  `null`. `at` is a valid calendar timestamp with seconds and an explicit `Z` or
  `±HH:MM` offset; fractional seconds are allowed. Optional `error` must be a
  string when present, including the empty string. Extra keys are ignored.
  Malformed JSON and invalid event shapes each add one to `badLines`, without
  affecting rows or event counts. Blank lines and a final newline are ignored.
- `DigestNight` contains `night`, `rows`, `badLines`, and `counts` with numeric
  `ok`, `retry`, `fail` totals across all accepted events, not final job statuses.
  Rows are sorted ascending by `job` using case-sensitive string ordering.
- Each `DigestRow` contains `job: string`, `owner: string | null`, `runs: number`,
  `retries: number`, `lastStatus: DigestStatus`, `lastError: string | null`,
  `firstAt: string`, `lastAt: string`, and `failures: number`. `runs` counts every
  accepted event for the job; `retries` and `failures` count their respective
  events, including failures followed by recovery.
- Events are ordered by chronological instant, then file order for equal instants.
  `firstAt` is from the first event in that order. `lastAt`, `lastStatus` and
  `owner` come from the last event. Timestamp strings retain their original text
  and offsets; events may fall outside the date used as the file locator.
- `lastError` is from the last event in that order that records an `error` string.
  A later event without `error` never clears it. With no recorded error it is
  `null`, independently of `lastStatus` and `failures`.
