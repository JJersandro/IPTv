// P0ïPo indelingslogica: puur ES-module, geen Node-only APIs (geen node:fs/crypto).
// Gedeeld door engine/build-catalog.mjs (Node, volledige catalogus, met overrides)
// en index.html (browser, alleen fallback-laag 4, zonder overrides) — één
// implementatie, geen gekopieerde logica.
const rx = {};

function hit(rule, ch, done) {
  if (rule.require) return rule.require.every((r) => hit(r, ch, done));
  if (rule.cats) return rule.cats.some((x) => ch.cats.includes(x));
  if (rule.countries) return rule.countries.some((x) => ch.countries.includes(x));
  if (rule.langs) return rule.langs.some((x) => ch.langs.includes(x));
  if (rule.name) return (rx[rule.name] ||= new RegExp(rule.name, 'i')).test(ch.name);
  if (rule.ref) return done.has(rule.ref);
  return false;
}

// ch: {id?, name, cats:[], countries:[], langs:[]}
// taxonomy: taxonomy.json .categories array
// overrides: engine/overrides.json object (optioneel — browser-fallback slaat dit over)
export function categorizeChannel(ch, taxonomy, overrides) {
  const done = new Set();
  for (const cat of taxonomy) {
    if (cat.fallback) continue;
    if ((cat.not || []).some((n) => done.has(n))) continue;
    if ((cat.any || []).some((r) => hit(r, ch, done))) done.add(cat.id);
  }
  const o = overrides && ch.id ? overrides[ch.id] : null;
  if (o) { (o.add || []).forEach((x) => done.add(x)); (o.remove || []).forEach((x) => done.delete(x)); }
  if (![...done].some((x) => x !== 'mipais')) done.add('algemeen');
  return [...done];
}
