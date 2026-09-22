# P0ïPo TV

Persoonlijke tv-omgeving bovenop de openbare playlists van [iptv-org](https://github.com/iptv-org/iptv).
Live: https://p0ipo-tv.vercel.app

## Wat zit waar
| Pad | Wat |
|---|---|
| `index.html` | De app (Hearth, Live, speler) — laadt de catalogus in 4 lagen: raw.githubusercontent.com (main), `/catalog/channels.json`, een lokale Cache API-kopie, en als allerlaatste redmiddel alleen de Mi Pais-lijsten |
| `repo-config.mjs` | Eén plek voor de repo-identiteit (owner/naam/branch), gebruikt door `index.html` en `api/p.js` |
| `api/p.js` | Stream-proxy: lost CORS en http-op-https op, en autoriseert verzoeken via een hosts-allowlist, HMAC-handtekeningen op zelf-herschreven URLs, of `Sec-Fetch-Site: same-origin` |
| `engine/build-catalog.mjs` | Catalogus-motor: ophalen, indelen, streams testen |
| `engine/categorize.mjs` | Gedeelde indelingslogica (taxonomie-matching) — gebruikt door zowel de motor (Node) als `index.html` (browser, alleen als allerlaatste redmiddel) |
| `engine/taxonomy.json` | Jouw categorieën (Mi Pais, Anime, Football, ...) en hun regels |
| `engine/overrides.json` | Handmatige correcties, winnen altijd |
| `catalog/` | Uitvoer van de motor: `channels.json`, `health.json`, `hosts.json`, `stats.json` (wordt elke 6 uur bijgewerkt) |
| `.github/workflows/catalog.yml` | Draait de motor elke 6 uur |

Motor-gezondheidsdata (`dead` in `channels.json`) is altijd een hint —
gebruikt om te sorteren/dimmen, nooit om een kanaal te verbergen. GitHub
Actions-runners draaien niet in Nederland, dus een NL-geoblockte stream kan
de health-check vanaf de runner ten onrechte laten falen; de lokale
dode-lijst in je eigen browser (`localStorage`) is en blijft leidend voor
wat daadwerkelijk verborgen wordt.

## Omgevingsvariabelen

| Naam | Verplicht? | Waar instellen |
|---|---|---|
| `PROXY_SECRET` | Aanbevolen | Vercel → Project → Settings → Environment Variables |

`PROXY_SECRET` ondertekent (HMAC-SHA256) de URLs die `api/p.js` zelf in
playlists herschrijft (segmenten/sub-playlists), zodat die altijd via de
proxy mogen lopen zonder dat hun host in `catalog/hosts.json` hoeft te
staan. Ontbreekt de variabele, dan schakelt dat autorisatiepad zichzelf
stil uit (één `console.warn` in de functielogs) — de hosts-allowlist en
`Sec-Fetch-Site`-controle blijven gewoon werken, dus de app blijft
functioneren, alleen iets minder streng voor niet-catalogusstreams.

**Restrisico**: `Sec-Fetch-Site` is een gewone request-header en dus
vervalsbaar door een client buiten de browser (curl, een script) — dat pad
is een goedkope heuristiek tegen misbruik vanuit een browser, geen
cryptografische garantie. De blokkade van private/loopback-adressen in
`api/p.js` is de échte grens en geldt voor elk verzoek, via elk pad.

**Aanbevolen**: stel in Vercel een bandbreedte-alert / spend limit in
(Project → Settings → Usage of Billing) — `api/p.js` proxyt videoverkeer,
dus dit is een goedkope, zinnige kostenbewaking.

## Eenmalig instellen
1. Maak op GitHub een **publieke** repo `p0ipo-tv` (leeg, zonder README).
2. In deze map: `git remote add origin https://github.com/<jouw-naam>/p0ipo-tv.git && git push -u origin main`
3. Vercel → project **p0ipo-tv** → Settings → Git → koppel de repo. Vanaf nu gaat elke push vanzelf live.
4. Vercel → Settings → Environment Variables → `PROXY_SECRET` zetten (zie boven).
5. GitHub → repo Settings → Actions → General → Workflow permissions → "Read and write permissions" aanzetten (nodig omdat de catalogus-workflow terugcommit naar de repo).
6. GitHub → tab **Actions** → "P0ïPo catalogus" → **Run workflow** voor de eerste catalogus.

## Lokaal testen
`HEALTH_LIMIT=300 node engine/build-catalog.mjs` (test alleen 300 streams).
