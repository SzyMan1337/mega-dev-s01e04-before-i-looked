import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';
import type { ReadNight } from '../src/digest/types.js';

const night = '2026-10-28';
const validEvent = { at: '2026-10-28T23:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' };

describe('readNight', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  function writeLines(lines: unknown[]): void {
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
  }

  it('exports the synchronous shared function type', () => {
    expectTypeOf(readNight).toEqualTypeOf<ReadNight>();
  });

  it('matches the complete golden digest from the read-only fixture', () => {
    const fixtureDir = fileURLToPath(new URL('../runs/', import.meta.url));
    expect(readNight(fixtureDir, night)).toEqual({
      night,
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok',
          lastError: null, failures: 0,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
          lastError: 'upstream 503', failures: 0,
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok',
          lastError: 'lock held', failures: 0,
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail',
          lastError: 'quota exceeded', failures: 1,
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok',
          lastError: null, failures: 0,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('returns null for a missing file or missing runs directory', () => {
    expect(readNight(runsDir, night)).toBeNull();
    expect(readNight(join(runsDir, 'missing'), night)).toBeNull();
  });

  it.each(['', '\n', ' \t\r\n\n  \r\n'])('distinguishes an existing empty or blank file (%j)', (contents) => {
    writeFileSync(join(runsDir, `${night}.jsonl`), contents);
    expect(readNight(runsDir, night)).toEqual({
      night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('propagates I/O errors other than missing files', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow(expect.objectContaining({ code: 'EISDIR' }));
    writeFileSync(join(runsDir, 'not-a-directory'), '');
    expect(() => readNight(join(runsDir, 'not-a-directory'), night))
      .toThrow(expect.objectContaining({ code: 'ENOTDIR' }));
  });

  it.each([
    '', '../2026-10-28', '2026-10-28/../2026-10-27', '/2026-10-28',
    '2026-10-28\\..', '2026-10-28.jsonl', '2026-1-28', '2026-10-2x',
    '2026-10-28\n', '2026-10-28\0', '%2e%2e%2f2026-10-28',
  ])('rejects unsafe or incorrectly shaped night locators (%j)', (locator) => {
    expect(() => readNight(runsDir, locator)).toThrow(RangeError);
  });

  it('counts broken JSON while ignoring blank lines and CRLF/final newlines', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), [
      '', ' \t', '{broken', JSON.stringify(validEvent), '', '{"at":',
      JSON.stringify({ ...validEvent, job: 'other', owner: null, extra: { ignored: true } }), '',
    ].join('\r\n'));
    const digest = readNight(runsDir, night);
    expect(digest).toMatchObject({ badLines: 2, counts: { ok: 2, retry: 0, fail: 0 } });
    expect(digest?.rows.map((row) => [row.job, row.owner, row.runs]))
      .toEqual([['lane/sync', 'rook', 1], ['other', null, 1]]);
  });

  it.each([
    null, [], true, 12, 'event', {},
    { ...validEvent, at: undefined },
    { ...validEvent, at: 123 },
    { ...validEvent, at: 'not a timestamp' },
    { ...validEvent, at: '2026-10-28' },
    { ...validEvent, at: '2026-10-28T23:00:00' },
    { ...validEvent, at: '2026-02-29T23:00:00Z' },
    { ...validEvent, at: '2026-04-31T23:00:00Z' },
    { ...validEvent, at: '2026-10-28T24:00:00Z' },
    { ...validEvent, at: '2026-10-28T23:00:00+24:00' },
    { ...validEvent, at: '2026-10-28T23:00:00Z\n' },
    { ...validEvent, job: undefined },
    { ...validEvent, job: null },
    { ...validEvent, job: 123 },
    { ...validEvent, status: undefined },
    { ...validEvent, status: 'unknown' },
    { ...validEvent, status: null },
    { ...validEvent, owner: undefined },
    { ...validEvent, owner: 123 },
    { ...validEvent, owner: {} },
    { ...validEvent, error: null },
    { ...validEvent, error: 123 },
  ])('counts each schema-invalid event without dropping surrounding valid events (%j)', (invalid) => {
    writeLines([validEvent, invalid, validEvent]);
    expect(readNight(runsDir, night)).toMatchObject({
      badLines: 1, counts: { ok: 2, retry: 0, fail: 0 },
      rows: [{ job: 'lane/sync', runs: 2, retries: 0, failures: 0, lastError: null }],
    });
  });

  it('keeps a malformed-only night distinct from an empty or missing night', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), 'broken\nnull\n');
    expect(readNight(runsDir, night)).toEqual({
      night, rows: [], badLines: 2, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('retains failures and the latest error after recovery', () => {
    writeLines([
      { ...validEvent, at: '2026-10-28T20:00:00Z', status: 'fail', error: 'unavailable' },
      { ...validEvent, at: '2026-10-28T21:00:00Z', status: 'retry', error: 'still unavailable' },
      { ...validEvent, at: '2026-10-28T22:00:00Z', owner: null },
    ]);
    expect(readNight(runsDir, night)).toEqual({
      night, badLines: 0, counts: { ok: 1, retry: 1, fail: 1 },
      rows: [{
        job: 'lane/sync', owner: null, runs: 3, retries: 1, failures: 1,
        lastStatus: 'ok', lastError: 'still unavailable',
        firstAt: '2026-10-28T20:00:00Z', lastAt: '2026-10-28T22:00:00Z',
      }],
    });
  });

  it('uses chronological instants for unsorted events with different offsets', () => {
    writeLines([
      { ...validEvent, at: '2026-10-29T00:30:00+02:00', status: 'retry', error: 'latest error' },
      { ...validEvent, at: '2026-10-28T23:00:00Z', owner: 'final owner' },
      { ...validEvent, at: '2026-10-28T18:00:00-04:00', status: 'fail', error: 'older error' },
      { ...validEvent, at: '2026-10-29T01:00:00+04:00', owner: 'first owner' },
    ]);
    expect(readNight(runsDir, night)).toEqual({
      night, badLines: 0, counts: { ok: 2, retry: 1, fail: 1 },
      rows: [{
        job: 'lane/sync', owner: 'final owner', runs: 4, retries: 1, failures: 1,
        lastStatus: 'ok', lastError: 'latest error',
        firstAt: '2026-10-29T01:00:00+04:00', lastAt: '2026-10-28T23:00:00Z',
      }],
    });
  });

  it('breaks equal-instant ties by file order, including first/last text and errors', () => {
    writeLines([
      { ...validEvent, at: '2026-10-28T23:00:00+01:00', status: 'fail', error: 'first' },
      { ...validEvent, at: '2026-10-28T22:00:00.000Z', status: 'retry', error: 'second' },
      { ...validEvent, at: '2026-10-28T18:00:00-04:00', owner: null },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'lane/sync', owner: null, runs: 3, retries: 1, failures: 1,
      lastStatus: 'ok', lastError: 'second',
      firstAt: '2026-10-28T23:00:00+01:00', lastAt: '2026-10-28T18:00:00-04:00',
    }]);
  });

  it('orders fractional seconds without rounding sub-millisecond instants', () => {
    writeLines([
      { ...validEvent, at: '2026-10-28T22:00:00.1001Z', error: 'latest', owner: null },
      { ...validEvent, at: '2026-10-28T23:00:00.1000+01:00', status: 'fail', error: 'earlier' },
      { ...validEvent, at: '2026-10-28T22:00:00.09Z', status: 'retry' },
    ]);
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({
      owner: null, lastStatus: 'ok', lastError: 'latest',
      firstAt: '2026-10-28T22:00:00.09Z', lastAt: '2026-10-28T22:00:00.1001Z',
    });
  });

  it('accepts leap dates, empty string fields and recorded empty errors', () => {
    writeLines([
      { ...validEvent, job: '', at: '2024-02-29T12:00:00Z', status: 'fail', error: 'old' },
      { ...validEvent, job: '', at: '2024-02-29T12:00:01Z', owner: '', error: '' },
      { ...validEvent, job: '', at: '2024-02-29T12:00:02Z', owner: '' },
    ]);
    expect(readNight(runsDir, night)).toMatchObject({
      badLines: 0, counts: { ok: 2, retry: 0, fail: 1 },
      rows: [{ job: '', owner: '', runs: 3, lastError: '', lastStatus: 'ok', failures: 1 }],
    });
  });

  it('sorts jobs deterministically and treats special object keys as ordinary jobs', () => {
    writeLines(['z', '__proto__', 'A', 'constructor', 'a'].map((job) => ({ ...validEvent, job })));
    expect(readNight(runsDir, night)?.rows.map((row) => row.job))
      .toEqual(['A', '__proto__', 'a', 'constructor', 'z']);
  });
});
