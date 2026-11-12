/**
 * LO STORICO DI 7 GIORNI PER MAGOMARKET: MINIMO, MASSIMO E MEDIA, GIORNO PER GIORNO.
 *
 * CHIESTO il 12/11/2026: MAGOMARKET raccoglieva i prezzi solo con la Web App
 * aperta; a PC spento lo storico aveva buchi. Questo lavoro gira 24 ore su 24
 * e raccoglie al posto suo: MAGOMARKET scarica il file e lo usa se e' fresco.
 * «Fallo per le carte da 10250 in su»: sotto quella soglia la carta non entra
 * (resta lo storico raccolto dalla Web App aperta).
 *
 * A ogni giro:
 *   1. legge lo storico precedente (file del giro prima, o quello pubblicato);
 *   2. per ogni carta da 10.250 in su (o gia' seguita e salita fin li' negli
 *      ultimi 7 giorni) aggiunge il prezzo al giorno di oggi, ora italiana;
 *   3. tiene solo gli ultimi 7 giorni;
 *   4. scrive `storico-7g-console.json` e `storico-7g-pc.json`.
 *
 * Forma del file (gli stessi quattro numeri che MAGOMARKET tiene per carta):
 *   { v: 1, quando, ultimo, fuso, soglia, giorni: ["2026-11-12", ...],
 *     carte: { "<defId>": [ [minimo, massimo, somma, campioni] | 0, ... ] } }
 * una casella per giorno, nello stesso ordine di `giorni`; 0 = nessun prezzo.
 *
 * I prezzi sono il «compralo subito» piu' basso (fut.gg), NON le vendite.
 * Non tocca mai il listino: se qualcosa va storto, il listino e' gia' scritto.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DATI = 'https://raw.githubusercontent.com/Ilmagodifut/futmago-listino/dati';
const GIORNI = 7;
const SOGLIA = 10_250;
const FUSO = 'Europe/Rome';
/* Due rilevazioni piu' vicine di cosi' sono lo stesso listino: non si conta due volte. */
const DISTANZA_MINIMA_MS = 60_000;

const destinazione = process.argv[2] ?? 'listino';
const cartellaPrecedenti = process.argv[3] ?? '.';

function giorno(istante) {
  /* en-CA scrive le date come AAAA-MM-GG. */
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(istante),
  );
}

function idDelListino(listino) {
  const ids = [];
  let id = Number(listino.id0);
  ids.push(id);
  for (const passo of listino.d) ids.push((id += Number(passo)));
  return ids;
}

async function precedente(nome) {
  const locale = path.join(cartellaPrecedenti, nome);
  try {
    if (existsSync(locale)) return JSON.parse(readFileSync(locale, 'utf8'));
  } catch {
    /* si prova online */
  }
  try {
    const r = await fetch(`${DATI}/${nome}?t=${Date.now()}`);
    if (r.ok) return await r.json();
  } catch {
    /* si riparte da zero */
  }
  return null;
}

const ora = Date.now();
const oggi = giorno(ora);

for (const piattaforma of ['console', 'pc']) {
  const nome = `storico-7g-${piattaforma}.json`;
  const listino = JSON.parse(readFileSync(path.join(destinazione, `listino-${piattaforma}.json`), 'utf8'));
  const ids = idDelListino(listino);
  const fuoriMercato = new Set(listino.n ?? []);
  const prima = await precedente(nome);
  const valido = prima?.v === 1 && Array.isArray(prima.giorni) && prima.carte && typeof prima.carte === 'object';

  /* I giorni: quelli di prima, piu' oggi se manca, gli ultimi sette. */
  const giorniPrima = valido ? prima.giorni : [];
  const giorni = giorniPrima.includes(oggi) ? [...giorniPrima] : [...giorniPrima, oggi];
  while (giorni.length > GIORNI) giorni.shift();
  const daPrima = giorni.map((g) => giorniPrima.indexOf(g));
  const iOggi = giorni.indexOf(oggi);
  const stessoListino = valido && Number(prima.ultimo) > 0 && ora - Number(prima.ultimo) < DISTANZA_MINIMA_MS;

  const carte = {};
  /* Le carte di prima, riportate sui giorni tenuti. */
  if (valido) {
    for (const [id, caselle] of Object.entries(prima.carte)) {
      if (!Array.isArray(caselle)) continue;
      const nuove = daPrima.map((j) => (j >= 0 && Array.isArray(caselle[j]) ? caselle[j] : 0));
      if (nuove.some((c) => c !== 0)) carte[id] = nuove;
    }
  }
  /* Il prezzo di adesso. */
  let rilevate = 0;
  if (!stessoListino) {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const p = Number(listino.p[i]);
      if (!(p > 0) || fuoriMercato.has(id)) continue;
      const chiave = String(id);
      const vecchie = carte[chiave];
      const giaSopra = vecchie?.some((c) => c !== 0 && c[1] >= SOGLIA) === true;
      if (p < SOGLIA && !giaSopra) continue;
      const caselle = vecchie ?? giorni.map(() => 0);
      const c = caselle[iOggi];
      caselle[iOggi] = c === 0 ? [p, p, p, 1] : [Math.min(c[0], p), Math.max(c[1], p), c[2] + p, c[3] + 1];
      carte[chiave] = caselle;
      rilevate++;
    }
  }
  /* Chi e' sceso sotto la soglia per tutta la settimana esce. */
  for (const [id, caselle] of Object.entries(carte)) {
    if (!caselle.some((c) => c !== 0 && c[1] >= SOGLIA)) delete carte[id];
  }

  const storico = {
    v: 1,
    quando: new Date(ora).toISOString(),
    ultimo: stessoListino ? Number(prima.ultimo) : ora,
    fuso: FUSO,
    soglia: SOGLIA,
    giorni,
    carte,
  };
  writeFileSync(path.join(destinazione, nome), JSON.stringify(storico));
  console.log(`  magomarket ${piattaforma}: ${Object.keys(carte).length} carte, ${rilevate} prezzi rilevati, giorni ${giorni.join(' ')}`);
}
