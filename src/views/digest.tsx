import type { DigestNight, DigestRow } from '../digest/types.js';

const columns = [
  'owner',
  'runs',
  'retries',
  'last status',
  'last error',
  'first time',
  'last time',
  'failures',
] as const;

function DigestRowView({ row }: { row: DigestRow }) {
  const flagged = row.retries >= 3 || row.failures > 0;
  return (
    <tr>
      <th scope="row" class={flagged ? 'flagged' : undefined}>{row.job}</th>
      <td>{row.owner ?? '—'}</td>
      <td>{row.runs}</td>
      <td class={row.retries >= 3 ? 'warn flagged' : undefined}>{row.retries}</td>
      <td class={row.lastStatus === 'fail' || row.failures > 0 ? 'warn flagged' : undefined}>
        {row.lastStatus}
      </td>
      <td>{row.lastError ?? '—'}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
      <td class={row.failures > 0 ? 'warn flagged' : undefined}>{row.failures}</td>
    </tr>
  );
}

export function DigestPage({ digest }: { digest: DigestNight }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p class={digest.badLines > 0 ? 'warn' : 'mute'}>bad lines: {digest.badLines}</p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table class="digest-table">
          <thead><tr><th scope="col">job</th>{columns.map((column) => <th scope="col">{column}</th>)}</tr></thead>
          <tbody>{digest.rows.map((row) => <DigestRowView row={row} />)}</tbody>
        </table>
      )}
    </>
  );
}
