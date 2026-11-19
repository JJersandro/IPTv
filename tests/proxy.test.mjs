import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, OPTIONS, wijstNaarIntern } from '../api/p.js';

const vraag = (u, kop = {}) => new Request('https://p0ipo-tv.vercel.app/api/p?u=' + encodeURIComponent(u), { headers: kop });

test('ongeldige url: 400', async () => {
  assert.equal((await GET(new Request('https://x.test/api/p?u=geen-url'))).status, 400);
});

test('interne adressen en andere protocollen: 403', async () => {
  for (const u of ['http://127.0.0.1/a.m3u8', 'http://192.168.1.10/a.m3u8', 'http://169.254.169.254/latest', 'http://localhost:3200/', 'file:///etc/passwd']) {
    assert.equal((await GET(vraag(u, { 'sec-fetch-site': 'same-origin' }))).status, 403, u);
  }
});

test('hostnaam die naar binnen wijst telt als intern', async () => {
  assert.equal(await wijstNaarIntern('localhost'), true);
});

test('zonder autorisatie: 403', async () => {
  assert.equal((await GET(vraag('http://voorbeeld-niet-in-catalogus.test/a.m3u8'))).status, 403);
});

test('OPTIONS geeft CORS-koppen', () => {
  assert.equal(OPTIONS().headers.get('access-control-allow-origin'), '*');
});
