import test from 'node:test';
import assert from 'node:assert/strict';
import { maakBediening, ZACHT } from '../bediening.mjs';

const nep = ({ metOuder = true, volume = 0.8, paused = false } = {}) => {
  const ouder = {};
  const win = {}; win.parent = metOuder ? ouder : win;
  const video = { volume, paused, pauzes: 0, pause() { this.paused = true; this.pauzes++; } };
  const op = maakBediening(win, video);
  const stuur = (actie, extra = {}) => op({ source: ouder, data: { type: 'p0ipo-tv-bediening', actie }, ...extra });
  return { op, stuur, video, ouder };
};

test('pauze pauzeert, en twee keer pauze pauzeert maar één keer', () => {
  const { stuur, video } = nep();
  assert.equal(stuur('pauze'), true);
  stuur('pauze');
  assert.equal(video.paused, true);
  assert.equal(video.pauzes, 1);
});

test('zacht en normaal: terug naar King\'s eigen volume, ook na dubbel zacht', () => {
  const { stuur, video } = nep({ volume: 0.8 });
  stuur('zacht'); assert.equal(video.volume, ZACHT);
  stuur('zacht'); assert.equal(video.volume, ZACHT);
  stuur('normaal'); assert.equal(video.volume, 0.8);
});

test('zacht wordt nooit harder dan King het zelf had', () => {
  const { stuur, video } = nep({ volume: 0.1 });
  stuur('zacht'); assert.equal(video.volume, 0.1);
  stuur('normaal'); assert.equal(video.volume, 0.1);
});

test('normaal zonder zacht ervoor laat het volume met rust', () => {
  const { stuur, video } = nep({ volume: 0.6 });
  stuur('normaal');
  assert.equal(video.volume, 0.6);
});

test('vreemde berichten doen niets', () => {
  const { op, stuur, video } = nep();
  assert.equal(op({ source: {}, data: { type: 'p0ipo-tv-bediening', actie: 'pauze' } }), false); // ander venster
  assert.equal(op({ source: null, data: null }), false);
  assert.equal(stuur('harder'), false);
  assert.equal(stuur('toString'), false); // geen geërfde functies
  assert.equal(op({ source: video, data: 'pauze' }), false);
  assert.equal(video.paused, false);
});

test('niet in een iframe: geen bediening', () => {
  const { stuur, video } = nep({ metOuder: false });
  assert.equal(stuur('pauze'), false);
  assert.equal(video.paused, false);
});
