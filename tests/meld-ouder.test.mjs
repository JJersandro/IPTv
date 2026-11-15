import test from 'node:test';
import assert from 'node:assert/strict';
import { maakMelder } from '../meld-ouder.mjs';

const nep = (metOuder = true) => {
  const berichten = [];
  const win = {}; win.parent = metOuder ? { postMessage: (b, o) => berichten.push([b, o]) } : win;
  return { win, berichten };
};

test('zonder iframe wordt niets verstuurd', () => {
  const { win, berichten } = nep(false);
  const m = maakMelder(win); m.kies('NPO 1', 'Nederland'); m.speelt(true); m.stop();
  assert.equal(berichten.length, 0);
});

test('speelt/pauze/stop in iframe', () => {
  const { win, berichten } = nep();
  const m = maakMelder(win);
  m.kies('NPO 1', 'Nederland'); m.speelt(true); m.speelt(false); m.stop();
  assert.deepEqual(berichten.map(x => x[0]), [
    { type: 'p0ipo-tv', zender: 'NPO 1', speelt: true, groep: 'Nederland' },
    { type: 'p0ipo-tv', zender: 'NPO 1', speelt: false, groep: 'Nederland' },
    { type: 'p0ipo-tv', zender: '' },
  ]);
  assert.ok(berichten.every(x => x[1] === '*'));
});

test('dubbele meldingen en groepsloos kanaal', () => {
  const { win, berichten } = nep();
  const m = maakMelder(win);
  m.kies('X'); m.speelt(true); m.speelt(true);
  assert.equal(berichten.length, 1);
  assert.equal('groep' in berichten[0][0], false);
});

test('speelt() zonder gekozen zender doet niets', () => {
  const { win, berichten } = nep();
  maakMelder(win).speelt(true);
  assert.equal(berichten.length, 0);
});

test('stop() na falende stream: zender leeg, en late pause-events zeggen niets meer', () => {
  const { win, berichten } = nep();
  const m = maakMelder(win);
  m.kies('Kapot TV', 'News'); m.speelt(true);
  m.stop(); // wat fail() doet
  m.speelt(false); // late pause-event
  assert.deepEqual(berichten.map(x => x[0]), [
    { type: 'p0ipo-tv', zender: 'Kapot TV', speelt: true, groep: 'News' },
    { type: 'p0ipo-tv', zender: '' },
  ]);
});
