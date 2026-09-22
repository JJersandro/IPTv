// P0ïPo TV stream-proxy: lost CORS en http-op-https (mixed content) op.
// Herschrijft HLS-playlists zodat alle segmenten ook via deze proxy lopen.
//
// Autorisatie (minstens één moet gelden, private/loopback-blocklist geldt
// altijd, voor elk verzoek, ongeacht welk pad hieronder toestaat):
//   1. host van het doel staat in catalog/hosts.json (allowlist)
//   2. geldige, niet-verlopen HMAC-sig op de u-parameter (PROXY_SECRET) —
//      alleen aanwezig op URLs die deze proxy zelf in playlists herschrijft
//   3. Sec-Fetch-Site: same-origin — dekt top-level aanroepen vanuit de app
//      zelf (bijv. een custom M3U-stream), maar is vervalsbaar buiten de
//      browser: een gewone request-header, geen cryptografisch bewijs.
export const config = { runtime: 'edge' };

import { rawUrl } from '../repo-config.mjs';

const BLOCKED_HOST = /^(localhost|127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|.*\.local$|.*\.internal$)/i;
const MEDIA_TYPE = /mpegurl|mp2t|video\/|audio\/|octet-stream|binary|dash\+xml|text\/plain|mp4/i;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'range', 'access-control-expose-headers': 'content-length, content-range' };
const txt = (status, msg) => new Response(msg, { status, headers: { ...cors, 'content-type': 'text/plain; charset=utf-8' } });

/* ---------- pad 1: hosts-allowlist (catalog/hosts.json) ---------- */
const HOSTS_TTL = 10 * 60 * 1000;
let hostsCache = { hosts: new Set(), fetchedAt: 0 };
async function getHostsAllowlist(selfOrigin){
  const now = Date.now();
  if (hostsCache.hosts.size && now - hostsCache.fetchedAt < HOSTS_TTL) return hostsCache.hosts;
  let hosts = null;
  try {
    const r = await fetch(rawUrl('catalog/hosts.json'));
    if (r.ok) hosts = (await r.json()).hosts;
  } catch {}
  if (!hosts) {
    try {
      const r = await fetch(new URL('/catalog/hosts.json', selfOrigin));
      if (r.ok) hosts = (await r.json()).hosts;
    } catch {}
  }
  if (hosts) hostsCache = { hosts: new Set(hosts), fetchedAt: now };
  return hostsCache.hosts;
}

/* ---------- pad 2: HMAC-handtekening met verlooptijd ---------- */
const PROXY_SECRET = (typeof process !== 'undefined' && process.env && process.env.PROXY_SECRET) || '';
if (!PROXY_SECRET) {
  console.warn('P0ïPo proxy: PROXY_SECRET niet gezet — HMAC-autorisatiepad (2) is uitgeschakeld. Paden 1 (allowlist) en 3 (same-origin) blijven werken.');
}
let hmacKeyPromise = null;
function getHmacKey(){
  if (!PROXY_SECRET) return Promise.resolve(null);
  if (!hmacKeyPromise) {
    hmacKeyPromise = crypto.subtle.importKey(
      'raw', new TextEncoder().encode(PROXY_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
    );
  }
  return hmacKeyPromise;
}
function bufToHex(buf){ return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function sign(url, exp){
  const key = await getHmacKey();
  if (!key) return null;
  const data = new TextEncoder().encode(url + '|' + exp);
  return bufToHex(await crypto.subtle.sign('HMAC', key, data));
}
function timingSafeEqual(a, b){
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifySig(url, exp, sig){
  if (!sig || !exp || !PROXY_SECRET) return false;
  if (Date.now() > Number(exp)) return false;
  const expected = await sign(url, exp);
  return !!expected && timingSafeEqual(expected, sig);
}

/* ---------- playlist herschrijven (elke aanroep = nieuwe exp = sliding window bij live playlists) ---------- */
async function asyncReplace(str, regex, asyncFn){
  const matches = [...str.matchAll(regex)];
  if (!matches.length) return str;
  let result = str, offset = 0;
  for (const m of matches) {
    const replacement = await asyncFn(m[0], m[1]);
    const idx = m.index + offset;
    result = result.slice(0, idx) + replacement + result.slice(idx + m[0].length);
    offset += replacement.length - m[0].length;
  }
  return result;
}
async function wrap(x, base, origin){
  let target;
  try { target = new URL(x, base).href; } catch { return x; }
  const isPlaylist = /\.m3u8?($|\?)/i.test(target);
  const exp = Date.now() + (isPlaylist ? 24 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000);
  const sig = await sign(target, exp);
  let out = origin + '/api/p?u=' + encodeURIComponent(target);
  if (sig) out += '&sig=' + sig + '&exp=' + exp;
  return out;
}
async function rewrite(body, base, origin){
  const lines = body.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) { out.push(line); continue; }
    if (t.startsWith('#')) {
      out.push(await asyncReplace(line, /URI="([^"]+)"/g, async (_, x) => `URI="${await wrap(x, base, origin)}"`));
      continue;
    }
    out.push(await wrap(t, base, origin));
  }
  return out.join('\n');
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const self = new URL(req.url);
  let target;
  try { target = new URL(self.searchParams.get('u')); } catch { return txt(400, 'Ongeldige stream-url'); }
  if (!/^https?:$/.test(target.protocol) || BLOCKED_HOST.test(target.hostname)) return txt(403, 'Deze bron is niet toegestaan');

  const sig = self.searchParams.get('sig');
  const exp = self.searchParams.get('exp');
  const secFetchSite = req.headers.get('sec-fetch-site');

  let authorized = false;
  const hosts = await getHostsAllowlist(self.origin);
  if (hosts.has(target.hostname)) authorized = true;
  if (!authorized && sig && exp) authorized = await verifySig(target.href, exp, sig);
  if (!authorized && secFetchSite === 'same-origin') authorized = true;
  if (!authorized) return txt(403, 'Niet geautoriseerd');

  const headers = { 'user-agent': 'Mozilla/5.0 (P0iPo TV)' };
  const range = req.headers.get('range');
  if (range) headers.range = range;

  let up;
  try { up = await fetch(target, { headers, redirect: 'follow' }); }
  catch { return txt(502, 'Bron onbereikbaar'); }

  const ct = up.headers.get('content-type') || '';
  const finalUrl = up.url || target.href;
  const looksLikeList = /mpegurl/i.test(ct) || /\.m3u8?($|\?)/i.test(new URL(finalUrl).pathname + new URL(finalUrl).search) || /text\/plain/i.test(ct);

  if (looksLikeList) {
    const body = await up.text();
    if (body.trimStart().startsWith('#EXTM3U')) {
      return new Response(await rewrite(body, finalUrl, self.origin), {
        status: up.status,
        headers: { ...cors, 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' },
      });
    }
    if (!/mpegurl/i.test(ct)) return txt(415, 'Geen mediastream');
  }

  if (ct && !MEDIA_TYPE.test(ct)) return txt(415, 'Geen mediastream');

  const out = { ...cors, 'content-type': ct || 'application/octet-stream', 'cache-control': 'public, max-age=10' };
  for (const h of ['content-length', 'content-range', 'accept-ranges']) {
    const v = up.headers.get(h); if (v) out[h] = v;
  }
  return new Response(up.body, { status: up.status, headers: out });
}
