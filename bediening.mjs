// Luistert naar de pagina om ons heen (de Wereldkaart van Nos-R.Ai.S., ADR-0012):
// { type: 'p0ipo-tv-bediening', actie: 'pauze' | 'zacht' | 'normaal' }.
// Alleen berichten van ons eigen ouder-venster tellen; al het andere wordt genegeerd.
export const ZACHT = 0.25; // volume (0-1) terwijl P0ïPo praat, net als ZACHT = 25 op de kaart

export function maakBediening(win = globalThis.window, video) {
  const inIframe = !!win && win.parent && win.parent !== win;
  let eigen = null; // King's eigen volume zolang we zacht staan, anders null

  const doe = {
    pauze() { if (!video.paused) video.pause(); },
    // Zacht = nooit harder dan King het zelf had. Twee keer zacht onthoudt nog steeds het échte volume.
    zacht() {
      if (eigen === null) eigen = video.volume;
      video.volume = Math.min(ZACHT, eigen);
    },
    // Normaal = terug naar King's eigen volume (niet naar 100%).
    normaal() {
      if (eigen === null) return;
      video.volume = eigen;
      eigen = null;
    },
  };

  // Geeft true als het bericht een geldige opdracht was (handig voor tests).
  return function opBericht(e) {
    if (!inIframe || !e || e.source !== win.parent) return false;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.type !== 'p0ipo-tv-bediening') return false;
    if (!Object.hasOwn(doe, d.actie)) return false;
    doe[d.actie]();
    return true;
  };
}
