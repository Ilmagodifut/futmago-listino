/**
 * LO STORICO DI 24 ORE DELLE CARTE SPECIALI (Icon, Eroi e promo).
 *
 * CHIESTO il 10/11/2026 per le Icon; l'11/11/2026 esteso: «aggiungi heroes
 * (normali e olografiche) e tutte le carte speciali/promo uscite fino ad ora
 * sul mercato, ad esempio Destined for Glory e Future Stars».
 *
 * Il listino tiene solo l'ultimo prezzo, e il ramo `dati` viene rifatto a ogni
 * giro: la storia la tiene questo file. A ogni giro:
 *
 *   1. legge lo storico precedente (`<precedente>`, o quello pubblicato);
 *   2. prende dal listino appena scritto il prezzo di ogni carta speciale;
 *   3. aggiunge la rilevazione, toglie quelle piu' vecchie di 24 ore;
 *   4. scrive tre file accanto al listino:
 *        promo-24h.json     lo storico intero (serve solo a questo lavoro)
 *        promo-vista.json   cio' che mostra l'app, gia' calcolato e leggero
 *        promo-quando.json  l'ora dell'ultima rilevazione: l'app lo guarda
 *                           ogni minuto e scarica la vista solo se cambia
 *
 * Carta speciale = rarita' diversa da 0 e 1 (comuni e rare), in vendita sul
 * mercato: un prezzo, e non nell'elenco «fuori mercato» del listino (SBC,
 * obiettivi, premi). Una promo nuova entra da sola, col nome di fut.gg.
 *
 * Olografiche: VERIFICATO su fut.gg (11/11/2026). Ogni carta speciale esiste
 * in due versioni con lo stesso giocatore (`id % 2^24`) e la stessa rarita':
 * quella con l'id piu' basso e' la normale, l'altra la «Pristine Holographic»
 * (Icon 275243 / 67384107, TOTW 3<<24 / 4<<24...). Non basta guardare se
 * l'id e' «alto»: tutte le promo lo hanno, olografiche o no.
 *
 * I prezzi sono il «compralo subito» piu' basso, NON le vendite.
 * Non tocca mai il listino: se qualcosa va storto, il listino e' gia' scritto.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RADICE = 'https://r2.fut.gg';
const ANNO = process.env['ANNO_FC'] ?? '27';
const FINESTRA_MIN = 24 * 60;
const FASCE = 48; /* il grafico dell'app: una tacca ogni mezz'ora */
const DATI = 'https://raw.githubusercontent.com/Ilmagodifut/futmago-listino/dati';
const GIOCATORI_EA =
  'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/27A3C9F1-6B2E-4D7A-8C1F-2E9B5A4D6C7E/2027/fut/items/web/players.json';

const destinazione = process.argv[2] ?? 'listino';
const precedente = process.argv[3];

async function prendi(url) {
  const risposta = await fetch(url, { headers: { accept: 'application/json' } });
  if (!risposta.ok) throw new Error(`${risposta.status} su ${url}`);
  return risposta.json();
}

/** Lo storico di prima: il file del giro precedente, o quello pubblicato, o il vecchio delle sole Icon. */
async function storicoPrecedente() {
  try {
    if (precedente && existsSync(precedente)) return JSON.parse(readFileSync(precedente, 'utf8'));
  } catch {
    /* si prova online */
  }
  for (const nome of ['promo-24h.json', 'icon-24h.json']) {
    try {
      return await prendi(`${DATI}/${nome}?t=${Date.now()}`);
    } catch {
      /* il prossimo */
    }
  }
  return null;
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
    console.log(`  promo: nomi EA non letti (${errore.message}), restano quelli di prima`);
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

/** Prezzi in centinaia: lo storico pesa la meta', e nessun prezzo FUT ha decine. */
const cento = (p) => (p > 0 ? Math.round(p / 100) : 0);

const manifesto = await prendi(`${RADICE}/${ANNO}/manifest.json`);
const versione = manifesto._version ?? 1;
const pool = await prendi(`${RADICE}/${ANNO}/streamlined-pool.v${versione}.${manifesto['streamlined-pool']}.json`);
const nucleo = await prendi(`${RADICE}/${ANNO}/fc-core-data.v${versione}.${manifesto['fc-core-data']}.json`).catch(() => ({
  rarities: [],
}));
const rarita = new Map((nucleo.rarities ?? []).map((r) => [r.eaId, r.name]));
const prezziConsole = JSON.parse(readFileSync(path.join(destinazione, 'listino-console.json'), 'utf8'));
const prezziPc = JSON.parse(readFileSync(path.join(destinazione, 'listino-pc.json'), 'utf8'));
const ids = idDelListino(prezziConsole);
if (ids.length !== pool.o.length) {
  console.log(`  promo: listino (${ids.length}) e pool (${pool.o.length}) non allineati, salto il giro`);
  process.exit(0);
}
const fuoriMercato = new Set([...(prezziConsole.n ?? []), ...(prezziPc.n ?? [])]);

const prima = await storicoPrecedente();
const nomi = await nomiEa();
const ora = Date.now();
const minuto = Math.round(ora / 60e3);

/*
 * Lo storico vecchio puo' essere quello delle sole Icon (`icon-24h.json`,
 * prezzi interi): si riconosce da `v: 1` e si porta in centinaia.
 */
const vecchioFormato = prima?.v === 1;
const vecchieT = Array.isArray(prima?.t) ? prima.t : [];
const tieni = vecchieT.map((t, i) => [t, i]).filter(([t]) => minuto - t <= FINESTRA_MIN);
const vecchie = new Map((prima?.carte ?? []).map((c) => [c.id, c]));
const dalVecchio = (v) => (vecchioFormato ? cento(v ?? 0) : (v ?? 0));

const carte = [];
for (let i = 0; i < ids.length; i++) {
  const r = pool.r[i];
  if (r === 0 || r === 1) continue;
  const id = ids[i];
  if (fuoriMercato.has(id)) continue;
  const pc = Number(prezziConsole.p[i]);
  const pp = Number(prezziPc.p[i]);
  const v = vecchie.get(id);
  if (!(pc > 0 || pp > 0) && !v) continue;
  const serie = (vecchia, nuovo) => [...tieni.map(([, j]) => (vecchia ? dalVecchio(vecchia[j]) : 0)), cento(nuovo)];
  carte.push({
    id,
    r,
    nr: rarita.get(r) ?? v?.nr ?? v?.r ?? null,
    nome: nomi.get(id % 0x1000000) ?? v?.nome ?? null,
    o: pool.o[i],
    pos: pool.pos[i],
    holo: false,
    console: serie(v?.console, pc),
    pc: serie(v?.pc, pp),
  });
}

/* Normale e olografica: nello stesso giocatore e rarita', l'id piu' basso e' la normale. */
const gruppi = new Map();
for (const c of carte) {
  const chiave = `${c.r}:${c.id % 0x1000000}`;
  gruppi.set(chiave, Math.min(gruppi.get(chiave) ?? Infinity, c.id));
}
for (const c of carte) c.holo = gruppi.get(`${c.r}:${c.id % 0x1000000}`) !== c.id;

const t = [...tieni.map(([x]) => x), minuto];
const storico = { v: 2, quando: new Date(ora).toISOString(), t, carte };
writeFileSync(path.join(destinazione, 'promo-24h.json'), JSON.stringify(storico));

/* ── LA VISTA DELL'APP: tutto gia' calcolato, una riga per carta ── */
function riassunto(serie) {
  const punti = [];
  serie.forEach((p, k) => {
    if (p > 0) punti.push([t[k], p]);
  });
  const adesso = serie[serie.length - 1] ?? 0;
  if (punti.length === 0) return [adesso, 0, 0, 0, 0, 0, []];
  const valori = punti.map(([, p]) => p);
  /*
   * MEDIANA, non media. SCELTO dall'utente l'11/11/2026: il prezzo piu' basso
   * in vendita ogni tanto schizza (mercato vuoto per qualche minuto) o crolla
   * (una carta comprata al volo), e la media se li porta dietro. La mediana e'
   * il prezzo che sta a meta' di tutte le rilevazioni: i picchi non la
   * spostano, e non serve scegliere una percentuale da scartare.
   */
  const ordinati = [...valori].sort((a, b) => a - b);
  const meta = Math.floor(ordinati.length / 2);
  const media = ordinati.length % 2 ? ordinati[meta] : Math.round((ordinati[meta - 1] + ordinati[meta]) / 2);
  /* Il grafico: per ogni mezz'ora l'ultimo prezzo visto, 0 se non c'e'. */
  const fasce = new Array(FASCE).fill(0);
  for (const [quando, p] of punti) {
    const fascia = FASCE - 1 - Math.floor((minuto - quando) / (FINESTRA_MIN / FASCE));
    if (fascia >= 0 && fascia < FASCE) fasce[fascia] = p;
  }
  return [adesso, Math.min(...valori), Math.max(...valori), media, valori.length, minuto - punti[0][0], fasce];
}
const vista = {
  v: 2,
  quando: storico.quando,
  inizio: t[0],
  rilevazioni: t.length,
  centinaia: true,
  carte: carte.map((c) => ({
    id: c.id,
    r: c.r,
    nr: c.nr,
    nome: c.nome,
    o: c.o,
    pos: c.pos,
    holo: c.holo,
    c: riassunto(c.console),
    p: riassunto(c.pc),
  })),
};
writeFileSync(path.join(destinazione, 'promo-vista.json'), JSON.stringify(vista));
writeFileSync(path.join(destinazione, 'promo-quando.json'), JSON.stringify({ quando: storico.quando }));
console.log(`  promo: ${carte.length} carte speciali, ${t.length} rilevazioni nelle 24 ore`);
