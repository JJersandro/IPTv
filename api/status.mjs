// App-contract v1 (Nos-R.Ai.S. ADR-0017): GET /api/status vertelt de motor hoe het met P0ïPo TV gaat.
// Antwoord: { app, ok, versie, melding }. Openbaar en zonder privégegevens.
// ok = de catalogus is vers (de bot draait elke 6 uur; ouder dan 24 uur = er hapert iets).
const MAX_OUD_MS = 24 * 60 * 60 * 1000;
const kop = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60, s-maxage=300',
  'access-control-allow-origin': '*',
};

export function maakStatus(stats, nu = Date.now(), sha = '') {
  const versie = sha ? sha.slice(0, 7) : null;
  const gemaakt = Date.parse(stats?.generated ?? '');
  if (!Number.isFinite(gemaakt)) {
    return { app: 'p0ipo-tv', ok: false, versie, melding: 'catalogus onleesbaar' };
  }
  const uur = Math.round((nu - gemaakt) / 3_600_000);
  const vers = nu - gemaakt <= MAX_OUD_MS;
  const zenders = `${stats.gezond ?? '?'} van ${stats.kanalen ?? '?'} zenders gezond`;
  return { app: 'p0ipo-tv', ok: vers, versie, melding: vers ? zenders : `catalogus ${uur} uur oud · ${zenders}` };
}

export async function GET(req) {
  let stats = null;
  try {
    const r = await fetch(new URL('/catalog/stats.json', req.url));
    if (r.ok) stats = await r.json();
  } catch { /* meldt maakStatus als onleesbaar */ }
  const status = maakStatus(stats, Date.now(), process.env.VERCEL_GIT_COMMIT_SHA || '');
  return new Response(JSON.stringify(status), { headers: kop });
}
