/**
 * LO STORICO DI 24 ORE DELLE ICON.
 *
 * CHIESTO il 10/11/2026: una pagina con, per ogni Icon, il prezzo attuale e
 * minimo, massimo e media delle ultime 24 ore.
 *
 * Il listino tiene solo l'ultimo prezzo, e il ramo `dati` viene rifatto a ogni
 * giro: la storia non c'e'. Questo file la tiene lui. A ogni giro:
 *
 *   1. legge lo storico precedente (`<precedente>`, o quello pubblicato);
 *   2. prende dal listino appena scritto il prezzo di ogni Icon, console e PC;
 *   3. aggiunge la rilevazione, toglie quelle piu' vecchie di 24 ore;
 *   4. scrive `icon-24h.json` accanto al listino.
 *
 * Quali carte sono Icon lo dice `streamlined-pool` di fut.gg (campionato 2118),
 * allineato voce per voce con l'indice del listino. I nomi vengono dal file
 * pubblico dei giocatori della Web App di EA, e si conservano da un giro
 * all'altro: se EA non risponde, restano quelli di prima.
 *
 * I prezzi sono il «compralo subito» piu' basso, NON le vendite: fut.gg e
 * FUTBIN le vendite le proteggono, EA le da' solo ai siti approvati.
 *
 * Non tocca mai il listino: se qualcosa va storto, si esce e il listino e'
 * gia' pubblicato.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RADICE = 'https://r2.fut.gg';
const ANNO = process.env['ANNO_FC'] ?? '27';
const CAMPIONATO_ICON = 2118;
/*
 * Solo le Icon base: le «Debutto internazionale» non sono sul mercato (detto
 * dall'utente l'11/11/2026, e infatti non hanno prezzo). VERIFICATO su fut.gg:
 * le Icon con l'id «alto» (byte in cima diverso da zero) sono le olografiche
 * («Pristine Holographic»), quelle con l'id basso le normali.
 */
const RARITA_ICON_BASE = 12;
const FINESTRA_MS = 24 * 3600e3;
const PUBBLICATO = 'https://raw.githubusercontent.com/Ilmagodifut/futmago-listino/dati/icon-24h.json';
const GIOCATORI_EA =
  'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/27A3C9F1-6B2E-4D7A-8C1F-2E9B5A4D6C7E/2027/fut/items/web/players.json';

const destinazione = process.argv[2] ?? 'listino';
const precedente = process.argv[3];

async function prendi(url) {
  const risposta = await fetch(url, { headers: { accept: 'application/json' } });
  if (!risposta.ok) throw new Error(`${risposta.status} su ${url}`);
  return risposta.json();
}

async function storicoPrecedente() {
  try {
    if (precedente && existsSync(precedente)) return JSON.parse(readFileSync(precedente, 'utf8'));
    return await prendi(`${PUBBLICATO}?t=${Date.now()}`);
  } catch {
    return null;
  }
}

async function nomiEa() {
  try {
    const dati = await prendi(GIOCATORI_EA);
    const nomi = new Map();
    for (const elenco of Object.values(dati)) {
      if (!Array.isArray(elenco)) continue;
      for (const g of elenco) {
        const nome = g.c || [g.f, g.l].filter(Boolean).join(' ');
        if (typeof g.id === 'number' && nome) nomi.set(g.id, nome);
      }
    }
    return nomi;
  } catch (errore) {
    console.log(`  icon: nomi EA non letti (${errore.message}), restano quelli di prima`);
    return new Map();
  }
}

function idDelListino(listino) {
  const ids = [];
  let id = Number(listino.id0);
  ids.push(id);
  for (const passo of listino.d) ids.push((id += Number(passo)));
  return ids;
}

const manifesto = await prendi(`${RADICE}/${ANNO}/manifest.json`);
const pool = await prendi(`${RADICE}/${ANNO}/streamlined-pool.v${manifesto._version ?? 1}.${manifesto['streamlined-pool']}.json`);
const nucleo = await prendi(`${RADICE}/${ANNO}/fc-core-data.v${manifesto._version ?? 1}.${manifesto['fc-core-data']}.json`).catch(
  () => ({ rarities: [] }),
);
const rarita = new Map((nucleo.rarities ?? []).map((r) => [r.eaId, r.name]));
const console_ = JSON.parse(readFileSync(path.join(destinazione, 'listino-console.json'), 'utf8'));
const pc = JSON.parse(readFileSync(path.join(destinazione, 'listino-pc.json'), 'utf8'));
const ids = idDelListino(console_);
if (ids.length !== pool.o.length) {
  console.log(`  icon: listino (${ids.length}) e pool (${pool.o.length}) non allineati, salto il giro`);
  process.exit(0);
}

const prima = await storicoPrecedente();
const nomi = await nomiEa();
const ora = Date.now();
const minuto = Math.round(ora / 60e3);

/* Le rilevazioni ancora dentro le 24 ore. */
const vecchieT = Array.isArray(prima?.t) ? prima.t : [];
const tieni = vecchieT.map((t, i) => [t, i]).filter(([t]) => ora - t * 60e3 <= FINESTRA_MS);
const vecchie = new Map((prima?.carte ?? []).map((c) => [c.id, c]));

const carte = [];
for (let i = 0; i < ids.length; i++) {
  if (pool.lg[i] !== CAMPIONATO_ICON || pool.r[i] !== RARITA_ICON_BASE) continue;
  const id = ids[i];
  const v = vecchie.get(id);
  const serie = (vecchia, nuovo) => [...tieni.map(([, j]) => (vecchia ? vecchia[j] ?? 0 : 0)), nuovo > 0 ? nuovo : 0];
  carte.push({
    id,
    nome: nomi.get(id & 0xffffff) ?? v?.nome ?? null,
    o: pool.o[i],
    holo: Math.floor(id / 0x1000000) !== 0,
    r: rarita.get(pool.r[i]) ?? v?.r ?? null,
    pos: pool.pos[i],
    console: serie(v?.console, Number(console_.p[i])),
    pc: serie(v?.pc, Number(pc.p[i])),
  });
}

const documento = { v: 1, quando: new Date(ora).toISOString(), t: [...tieni.map(([t]) => t), minuto], carte };
writeFileSync(path.join(destinazione, 'icon-24h.json'), JSON.stringify(documento));
console.log(`  icon: ${carte.length} carte, ${documento.t.length} rilevazioni nelle 24 ore`);
