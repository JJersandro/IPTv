// Meldt aan de pagina om ons heen (als de app in een iframe draait) welke zender speelt.
// Verstuurt NIETS anders dan { type, zender, groep?, speelt? }: geen URLs, geen gebruikersdata.
export function maakMelder(win = globalThis.window) {
  const inIframe = !!win && win.parent && win.parent !== win;
  let huidig = null, laatste = '';
  const stuur = (bericht) => {
    if (!inIframe) return;
    const json = JSON.stringify(bericht);
    if (json === laatste) return; // dubbele meldingen overslaan
    laatste = json;
    try { win.parent.postMessage(bericht, '*'); } catch { /* ouder weg of geblokkeerd: negeren */ }
  };
  return {
    // Er is een zender gekozen (nog niet per se beeld).
    kies(zender, groep) { huidig = { zender: String(zender || ''), groep: groep ? String(groep) : '' }; },
    // Beeld loopt (speelt=true) of is gepauzeerd (speelt=false).
    speelt(speelt) {
      if (!huidig || !huidig.zender) return;
      const b = { type: 'p0ipo-tv', zender: huidig.zender, speelt: !!speelt };
      if (huidig.groep) b.groep = huidig.groep;
      stuur(b);
    },
    // Afspelen gestopt of speler gesloten.
    stop() { huidig = null; stuur({ type: 'p0ipo-tv', zender: '' }); },
  };
}
