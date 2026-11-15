import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, DigestStatus, ReadNight } from './types.js';

type Instant = { milliseconds: number; fraction: string };
type RunEvent = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
  instant: Instant;
};
type JobState = {
  row: DigestRow;
  first: Instant;
  last: Instant;
  lastErrorAt: Instant | null;
};

function parseInstant(at: string): Instant | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d+))?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(at);
  if (!match || match[0] !== at) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > days[month - 1]) return null;

  // Keep fractional precision beyond Date's milliseconds when ordering instants.
  const milliseconds = Date.parse(at.replace(/\.\d+/, ''));
  if (!Number.isFinite(milliseconds)) return null;
  return { milliseconds, fraction: (match[4] ?? '').replace(/0+$/, '') };
}

function compareInstants(a: Instant, b: Instant): number {
  if (a.milliseconds !== b.milliseconds) return a.milliseconds - b.milliseconds;
  return a.fraction < b.fraction ? -1 : a.fraction > b.fraction ? 1 : 0;
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('at' in value) || typeof value.at !== 'string'
    || !('job' in value) || typeof value.job !== 'string'
    || !('status' in value) || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')
    || !('owner' in value) || (typeof value.owner !== 'string' && value.owner !== null)
    || ('error' in value && typeof value.error !== 'string')) return null;

  const instant = parseInstant(value.at);
  if (instant === null) return null;
  return {
    at: value.at,
    job: value.job,
    status: value.status,
    owner: value.owner,
    error: 'error' in value && typeof value.error === 'string' ? value.error : undefined,
    instant,
  };
}

export const readNight: ReadNight = (runsDir, night): DigestNight | null => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) {
    throw new RangeError('Night must be a YYYY-MM-DD filename locator');
  }

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const result: DigestNight = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const jobs = new Map<string, JobState>();
  for (const line of contents.split('\n')) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (event === null) {
      result.badLines += 1;
      continue;
    }

    result.counts[event.status] += 1;
    let state = jobs.get(event.job);
    if (!state) {
      state = {
        row: {
          job: event.job, owner: event.owner, runs: 0, retries: 0,
          lastStatus: event.status, lastError: null,
          firstAt: event.at, lastAt: event.at, failures: 0,
        },
        first: event.instant, last: event.instant, lastErrorAt: null,
      };
      jobs.set(event.job, state);
    }

    const row = state.row;
    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    if (event.status === 'fail') row.failures += 1;
    if (compareInstants(event.instant, state.first) < 0) {
      state.first = event.instant;
      row.firstAt = event.at;
    }
    // Processing file order makes the later line win equal-time ties.
    if (compareInstants(event.instant, state.last) >= 0) {
      state.last = event.instant;
      row.lastAt = event.at;
      row.lastStatus = event.status;
      row.owner = event.owner;
    }
    if (event.error !== undefined
      && (state.lastErrorAt === null || compareInstants(event.instant, state.lastErrorAt) >= 0)) {
      state.lastErrorAt = event.instant;
      row.lastError = event.error;
    }
  }

  result.rows = [...jobs.values()].map(({ row }) => row)
    .sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return result;
};
