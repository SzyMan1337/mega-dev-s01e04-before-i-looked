import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (mode !== 'marked' && mode !== 'clean') {
  throw new Error('Usage: node scripts/export-preview.mjs <marked|clean>');
}

const rigDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(rigDir, '.private', 'preview');
const outputFile = path.join(outputDir, 'index.html');
const port = await availablePort();
const childEnv = { ...process.env, PORT: String(port) };
if (mode === 'clean') childEnv.LANE_MARKER = '';

let child;
try {
  child = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', '--import', 'tsx', 'src/server.ts'],
    { cwd: rigDir, env: childEnv, stdio: 'ignore' },
  );

  await waitUntilReady(child, `http://127.0.0.1:${port}`);
  const response = await fetch(`http://127.0.0.1:${port}/digest/2026-10-28`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Digest request failed with HTTP ${response.status}`);

  const html = await response.text();
  validateHtml(html, mode);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputFile, html, 'utf8');
  console.log(`Exported digest HTML (${mode}; 5 golden jobs) to .private/preview/index.html`);
} finally {
  await stopChild(child);
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local port');
  const selectedPort = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return selectedPort;
}

async function waitUntilReady(processChild, baseUrl) {
  let exitCode;
  let spawnFailed = false;
  processChild.once('exit', (code) => { exitCode = code; });
  processChild.once('error', () => { spawnFailed = true; });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (spawnFailed) throw new Error('Could not start the spawned rig process');
    if (exitCode !== undefined) throw new Error(`Spawned rig exited before becoming ready (${exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        await delay(150);
        if (exitCode !== undefined) throw new Error(`Spawned rig exited during startup (${exitCode})`);
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Spawned rig exited')) throw error;
    }
    await delay(150);
  }
  throw new Error('Timed out waiting for the spawned rig to start');
}

function validateHtml(html, exportMode) {
  const jobs = [...html.matchAll(/<th\s+scope="row"[^>]*>([^<]+)<\/th>/g)].map((match) => match[1]);
  const expectedJobs = [
    'digest/render',
    'fixtures/refresh',
    'lane/sync',
    'notes/backup',
    'rig/rotate-logs',
  ];
  if (JSON.stringify(jobs) !== JSON.stringify(expectedJobs)) {
    throw new Error('Digest response did not contain the five expected golden jobs in order');
  }
  if (!/<style>[\s\S]*<\/style>/.test(html)) throw new Error('Digest response has no inline stylesheet');
  if (/<script\b/i.test(html)) throw new Error('Digest response contains a client script');
  if (/<(?:img|link|iframe|source|video|audio)\b[^>]*(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html)) {
    throw new Error('Digest response contains an external asset');
  }
  if (/@import\b|url\(\s*["']?(?:https?:)?\/\//i.test(html)) {
    throw new Error('Digest response references an external stylesheet asset');
  }
  if (exportMode === 'clean') {
    if (!html.includes('no marker set')) throw new Error('Clean digest is missing the no-marker banner');
  } else {
    const banner = html.match(/class="marker">([^<]*)<\/span>/)?.[1]?.trim();
    const requestedMarker = (process.env.LANE_MARKER ?? '').trim();
    if (!banner || banner === 'no marker set') throw new Error('Marked digest is missing its lane marker');
    if (requestedMarker && !banner.includes(requestedMarker)) {
      throw new Error('Marked digest does not contain the requested lane marker');
    }
  }
}

async function stopChild(processChild) {
  if (!processChild || processChild.exitCode !== null || processChild.signalCode !== null) return;
  const closed = new Promise((resolve) => processChild.once('close', resolve));
  processChild.kill('SIGTERM');
  const stopped = await Promise.race([closed.then(() => true), delay(2_000).then(() => false)]);
  if (!stopped && processChild.exitCode === null && processChild.signalCode === null) {
    processChild.kill('SIGKILL');
    await closed;
  }
}
