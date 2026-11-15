import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const night = '2026-10-28';
const paths = [`/digest/${night}`, `/api/digest/${night}`];
const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

function tableRows(html: string): string[] {
  return [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(([row]) => row);
}

function rowForJob(rows: string[], job: string): string | undefined {
  return rows.find((row) => row.includes(`>${job}</`));
}

describe('digest routes', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  function app() {
    return createApp({ ...config, runsDir });
  }

  it('returns 404 for a missing night on both routes', async () => {
    for (const path of paths) {
      const response = await app().request(path);
      expect(response.status).toBe(404);
    }
  });

  it('returns 404 for invalid locators, including an encoded trailing newline', async () => {
    for (const prefix of ['/digest/', '/api/digest/']) {
      for (const locator of ['not-a-night', `${night}%0A`]) {
        expect((await app().request(prefix + locator)).status).toBe(404);
      }
    }
  });

  it('returns 200 for an existing empty night on both routes', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '');

    for (const path of paths) {
      const response = await app().request(path);
      expect(response.status).toBe(200);
      if (path.startsWith('/api/')) {
        expect(await response.json()).toEqual({
          night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
        });
      } else {
        expect(await response.text()).toContain('nothing ran');
      }
    }
  });

  it('keeps valid rows, warnings, offsets and ordering in sync across HTML and JSON', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), [
      JSON.stringify({ at: '2026-10-28T08:00:00-04:00', job: 'zeta/recovered', status: 'fail', owner: 'worker-z', error: 'disk busy' }),
      JSON.stringify({ at: '2026-10-28T14:01:00+02:00', job: 'alpha/retry', status: 'retry', owner: 'worker-a', error: 'upstream 503' }),
      '{malformed',
      JSON.stringify({ at: '2026-10-28T14:00:00+02:00', job: 'alpha/retry', status: 'retry', owner: 'worker-a' }),
      JSON.stringify({ at: '2026-10-28T14:02:00+02:00', job: 'alpha/retry', status: 'retry', owner: 'worker-a' }),
      JSON.stringify({ at: '2026-10-28T14:03:00+02:00', job: 'alpha/retry', status: 'ok', owner: 'worker-a' }),
      JSON.stringify({ at: '2026-10-28T08:01:00-04:00', job: 'zeta/recovered', status: 'ok', owner: null }),
      JSON.stringify({ at: '2026-10-28T15:00:00+04:00', job: 'invalid/owner', status: 'ok', owner: 42 }),
    ].join('\n'));

    const pageResponse = await app().request(paths[0]);
    const apiResponse = await app().request(paths[1]);
    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);

    const digest = await apiResponse.json() as DigestNight;
    expect(digest).toEqual({
      night,
      badLines: 2,
      counts: { ok: 2, retry: 3, fail: 1 },
      rows: [
        {
          job: 'alpha/retry', owner: 'worker-a', runs: 4, retries: 3,
          lastStatus: 'ok', lastError: 'upstream 503',
          firstAt: '2026-10-28T14:00:00+02:00', lastAt: '2026-10-28T14:03:00+02:00', failures: 0,
        },
        {
          job: 'zeta/recovered', owner: null, runs: 2, retries: 0,
          lastStatus: 'ok', lastError: 'disk busy',
          firstAt: '2026-10-28T08:00:00-04:00', lastAt: '2026-10-28T08:01:00-04:00', failures: 1,
        },
      ],
    });

    const htmlRows = tableRows(await pageResponse.text());
    const jobRows = htmlRows.filter((row) => rowForJob([row], 'alpha/retry') || rowForJob([row], 'zeta/recovered'));
    expect(jobRows.map((row) => row.includes('alpha/retry') ? 'alpha/retry' : 'zeta/recovered'))
      .toEqual(digest.rows.map((row) => row.job));

    for (const row of digest.rows) {
      const markup = rowForJob(jobRows, row.job);
      expect(markup).toBeDefined();
      for (const value of [
        row.owner ?? '—', String(row.runs), String(row.retries), row.lastStatus,
        row.lastError ?? '—', row.firstAt, row.lastAt,
      ]) {
        expect(markup).toContain(value);
      }
    }

    const retryRow = rowForJob(jobRows, 'alpha/retry');
    const recoveredRow = rowForJob(jobRows, 'zeta/recovered');
    expect(retryRow).toMatch(/class="[^"]*\bwarn\b/);
    expect(recoveredRow).toMatch(/class="[^"]*\bwarn\b/);
  });
});
