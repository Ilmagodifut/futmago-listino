/**
 * IL CATALOGO DELLE CARTE PER MAGOMARKET SENZA ESTENSIONE (iPhone, Android).
 *
 * CHIESTO il 12/11/2026: MAGOMARKET anche su telefono, «come fatto con
 * FUTMAGO»: app Android fuori da Google Play e, su iPhone, lo userscript per
 * l'app Userscripts. Li' MAGOMARKET gira dentro la pagina di EA, senza il
 * fondo dell'estensione, e dalla pagina r2.fut.gg non si legge (niente CORS,
 * MISURATO il 12/11/2026: «Failed to fetch»). raw.githubusercontent.com si'
 * (FUTMAGO ci legge gia' il listino). Questo file mette qui quello che manca
 * al listino: valutazioni, rarita', nomi e colori delle promo, team.
 *
 *   magomarket-catalogo.json
 *     { v: 1, quando, carte, o: [overall], r: [rarita'],
 *       rarita: { eaId: nome }, colori: { eaId: "39ff14" },
 *       squadre: [ { id, name, slug, rarityGroupId, releaseDate, rarityEaIds, highlightedPlayersEaIds } ] }
 *
 * `o` e `r` sono nello STESSO ORDINE di `listino-<piattaforma>.json` (lo
 * stesso indice di fut.gg): se le lunghezze non tornano non si scrive niente.
 * Il file grande di fut.gg (fc-core-data, ~1,9 MB) si scarica solo quando
 * cambia (si ricorda l'impronta fra un giro e l'altro).
 * Non tocca mai il listino: se qualcosa va storto, il listino e' gia' scritto.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RADICE = 'https://r2.fut.gg';
const ANNO = process.env['ANNO_FC'] ?? '27';
const destinazione = process.argv[2] ?? 'listino';
const memoria = process.argv[3] ?? 'mm-core.json';

async function prendi(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} su ${url}`);
  return r.json();
}

const manifesto = await prendi(`${RADICE}/${ANNO}/manifest.json`);
const versione = manifesto._version ?? 1;
const pool = await prendi(`${RADICE}/${ANNO}/streamlined-pool.v${versione}.${manifesto['streamlined-pool']}.json`);

/* Il nucleo (nomi delle rarita' e team) solo se e' cambiato. */
let nucleo = null;
try {
  if (existsSync(memoria)) {
    const m = JSON.parse(readFileSync(memoria, 'utf8'));
    if (m.impronta === manifesto['fc-core-data']) nucleo = m.nucleo;
  }
} catch {
  /* si riscarica */
}
if (nucleo === null) {
  const core = await prendi(`${RADICE}/${ANNO}/fc-core-data.v${versione}.${manifesto['fc-core-data']}.json`);
  nucleo = {
    rarita: Object.fromEntries((core.rarities ?? []).filter((x) => typeof x.name === 'string').map((x) => [x.eaId, x.name])),
    colori: Object.fromEntries(
      (core.rarities ?? []).filter((x) => /^[0-9a-f]{6}$/i.test(String(x.dominantColor))).map((x) => [x.eaId, x.dominantColor]),
    ),
    squadre: (core.raritySquads ?? []).map((q) => ({
      id: q.id,
      name: q.name,
      slug: q.slug,
      rarityGroupId: q.rarityGroupId,
      releaseDate: q.releaseDate,
      rarityEaIds: q.rarityEaIds,
      highlightedPlayersEaIds: q.highlightedPlayersEaIds,
    })),
  };
  writeFileSync(memoria, JSON.stringify({ impronta: manifesto['fc-core-data'], nucleo }));
}

const listino = JSON.parse(readFileSync(path.join(destinazione, 'listino-console.json'), 'utf8'));
const carte = 1 + (Array.isArray(listino.d) ? listino.d.length : 0);
if (!Array.isArray(pool.o) || pool.o.length !== carte || !Array.isArray(pool.r) || pool.r.length !== carte) {
  console.log(`  magomarket catalogo: listino (${carte}) e pool (${pool.o?.length}) non allineati, salto il giro`);
  process.exit(0);
}
writeFileSync(
  path.join(destinazione, 'magomarket-catalogo.json'),
  JSON.stringify({ v: 1, quando: new Date().toISOString(), carte, o: pool.o, r: pool.r, ...nucleo }),
);
console.log(`  magomarket catalogo: ${carte} carte, ${Object.keys(nucleo.rarita).length} rarita', ${nucleo.squadre.length} team`);
