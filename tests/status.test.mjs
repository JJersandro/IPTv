import test from 'node:test';
import assert from 'node:assert/strict';
import { maakStatus } from '../api/status.mjs';

const nu = Date.parse('2026-11-20T12:00:00Z');

test('verse catalogus: ok, met zenders en versie', () => {
  const s = maakStatus({ generated: '2026-11-20T07:21:46Z', kanalen: 11681, gezond: 8396 }, nu, 'd569a37abcdef');
  assert.deepEqual(s, { app: 'p0ipo-tv', ok: true, versie: 'd569a37', melding: '8396 van 11681 zenders gezond' });
});

test('catalogus ouder dan 24 uur: niet ok, en zegt hoe oud', () => {
  const s = maakStatus({ generated: '2026-11-18T12:00:00Z', kanalen: 10, gezond: 5 }, nu);
  assert.equal(s.ok, false);
  assert.match(s.melding, /^catalogus 48 uur oud/);
  assert.equal(s.versie, null);
});

test('geen of kapotte stats: niet ok', () => {
  assert.equal(maakStatus(null, nu).ok, false);
  assert.equal(maakStatus({ generated: 'gisteren' }, nu).melding, 'catalogus onleesbaar');
});
