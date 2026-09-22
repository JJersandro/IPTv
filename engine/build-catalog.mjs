// P0ïPo catalogus-motor: haalt iptv-org op, voegt land/taal/categorie samen,
// deelt in volgens engine/taxonomy.json, test streams en schrijft catalog/channels.json.
// Draait zonder dependencies op Node 20+.  HEALTH_LIMIT=n test alleen n streams (lokaal testen).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { categorizeChannel } from './categorize.mjs';

const BASE = 'https://iptv-org.github.io/iptv/';
const OUT = new URL('../catalog/', import.meta.url);
const HERE = new URL('./', import.meta.url);
const CONCURRENCY = +(process.env.HEALTH_CONCURRENCY || 48);
const TIMEOUT = 8000;
const LIMIT = process.env.HEALTH_LIMIT ? +process.env.HEALTH_LIMIT : Infinity;
const DEAD_AFTER = 2; // pas "dood" na 2 mislukte runs op rij (streams haperen soms)

const readJSON = async (url, d) => { try { return JSON.parse(await readFile(url, 'utf8')); } catch { return d; } };
const idOf = url => 'ch_' + createHash('sha1').update(url).digest('hex').slice(0, 10);

function parse(txt) {
  const out = []; let cur = null;
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim(); if (!l) continue;
    if (l.startsWith('#EXTINF')) {
      const a = {}; l.replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { a[k] = v; });
      const cut = l.indexOf(',', Math.max(0, l.lastIndexOf('"')));
      cur = { name: (cut >= 0 ? l.slice(cut + 1).trim() : '') || a['tvg-name'] || 'Onbekend', logo: a['tvg-logo'] || '', tvg: a['tvg-id'] || '', group: a['group-title'] || '' };
    } else if (!l.startsWith('#') && cur) { cur.url = l; out.push(cur); cur = null; }
  }
  return out;
}
const get = async u => { const r = await fetch(BASE + u + '.m3u'); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text(); };

// ---------- 1. ophalen en samenvoegen ----------
const [main, byCountry, byLang] = await Promise.all(['index', 'index.country', 'index.language'].map(get));
const COUNTRY_CODES = await fetch('https://iptv-org.github.io/api/countries.json').then(r => r.json()).catch(() => []);
const LANG_CODES = await fetch('https://iptv-org.github.io/api/languages.json').then(r => r.json()).catch(() => []);
const countryByName = new Map(COUNTRY_CODES.map(c => [c.name.toLowerCase(), c.code.toLowerCase()]));
const langByName = new Map(LANG_CODES.map(l => [l.name.toLowerCase(), l.code.toLowerCase()]));

const chans = new Map();
for (const c of parse(main)) {
  if (chans.has(c.url)) continue;
  chans.set(c.url, {
    id: idOf(c.url), name: c.name.replace(/\s*\(\d{3,4}[pi]\)/i, '').replace(/\s*\[[^\]]*\]/g, '').trim(),
    q: (c.name.match(/\((\d{3,4}[pi])\)/i) || [])[1] || '', logo: c.logo, url: c.url, tvg: c.tvg,
    cats: c.group.split(';').map(s => s.trim().toLowerCase()).filter(s => s && s !== 'undefined'),
    geo: /geo-blocked/i.test(c.name), not247: /not 24\/7/i.test(c.name), countries: [], langs: []
  });
}
for (const c of parse(byCountry)) {
  const ch = chans.get(c.url); if (!ch) continue;
  const code = countryByName.get(c.group.toLowerCase()) || (c.group.toLowerCase() === 'international' ? 'int' : null);
  if (code && !ch.countries.includes(code)) ch.countries.push(code);
}
for (const c of parse(byLang)) {
  const ch = chans.get(c.url); if (!ch) continue;
  const code = langByName.get(c.group.toLowerCase());
  if (code && !ch.langs.includes(code)) ch.langs.push(code);
}

// ---------- 2. indelen ----------
const tax = (await readJSON(new URL('taxonomy.json', HERE), {})).categories;
const overrides = await readJSON(new URL('overrides.json', HERE), {});
for (const ch of chans.values()) {
  ch.p0 = categorizeChannel(ch, tax, overrides);
}

// ---------- 3. geheugen van vorige run ----------
// health.json bewaart per kanaal: [eerstGezien, aantalMislukteRunsOpRij, laatsteFout]
const prevHealth = await readJSON(new URL('health.json', OUT), null);
const prevById = new Map(Object.entries(prevHealth?.channels || {}).map(([id, [first, fails, err]]) => [id, { first, fails, err, ok: fails < DEAD_AFTER }]));
const now = new Date().toISOString();

// ---------- 4. streams testen ----------
async function check(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (P0iPo TV health)' } });
    if (!r.ok) return `http ${r.status}`;
    const reader = r.body.getReader(); const { value } = await reader.read(); ctl.abort();
    const head = Buffer.from(value || []).toString('utf8', 0, 64);
    if (/\.m3u8?($|\?)/i.test(new URL(r.url).pathname) && !head.includes('#EXTM3U')) return 'geen geldige playlist';
    return null;
  } catch (e) { return e.name === 'AbortError' ? 'timeout' : 'onbereikbaar'; }
  finally { clearTimeout(t); }
}
const list = [...chans.values()];
const toCheck = list.slice(0, Math.min(list.length, LIMIT));
let idx = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (idx < toCheck.length) {
    const ch = toCheck[idx++];
    const p = prevById.get(ch.id);
    const err = await check(ch.url);
    const fails = err ? ((p?.fails) || 0) + 1 : 0;
    ch.ok = fails < DEAD_AFTER; ch.fails = fails; ch.err = err || undefined; ch.checked = now;
  }
}));
for (const ch of list) {
  const p = prevById.get(ch.id);
  ch.first = p?.first || now;
  if (!ch.checked) { ch.ok = p?.ok ?? true; ch.fails = p?.fails || 0; ch.checked = p?.checked; }
}

// ---------- 5. wegschrijven ----------
list.sort((a, b) => a.name.localeCompare(b.name));
const stats = { kanalen: list.length, getest: toCheck.length, gezond: list.filter(c => c.ok).length, dood: list.filter(c => !c.ok).length,
  faaldeDezeRun: toCheck.filter(c => c.fails > 0).length,
  nieuw: prevHealth ? list.filter(c => c.first === now).length : 0,
  perCategorie: Object.fromEntries(tax.map(t => [t.id, list.filter(c => c.p0.includes(t.id)).length])) };
await mkdir(OUT, { recursive: true });
// Compact voor de app (telefoonvriendelijk): korte sleutels, alleen wat de app nodig heeft.
const compact = list.map(c => {
  const o = { i: c.id, n: c.name, u: c.url, p: c.p0 };
  if (c.logo) o.l = c.logo; if (c.q) o.q = c.q; if (c.countries.length) o.c = c.countries; if (c.langs.length) o.g = c.langs;
  if (c.geo) o.geo = 1; if (c.not247) o.x = 1; if (!c.ok) o.dead = 1; o.f = c.first.slice(0, 10);
  return o;
});
await writeFile(new URL('channels.json', OUT), JSON.stringify({ generated: now, categories: tax.map(({ id, label, emoji }) => ({ id, label, emoji })), channels: compact }));
await writeFile(new URL('health.json', OUT), JSON.stringify({ generated: now, channels: Object.fromEntries(list.map(c => [c.id, [c.first, c.fails, c.err || null]])) }));
await writeFile(new URL('stats.json', OUT), JSON.stringify({ generated: now, ...stats }, null, 2));
// hosts.json: allowlist voor api/p.js — unieke hostnames van alle catalogus-streams.
const hosts = [...new Set(list.map(c => { try { return new URL(c.url).hostname; } catch { return null; } }).filter(Boolean))].sort();
await writeFile(new URL('hosts.json', OUT), JSON.stringify({ generated: now, hosts }));
console.log(JSON.stringify(stats, null, 2));
