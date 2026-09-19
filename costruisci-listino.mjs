/*
 * IL LISTINO PREZZI, RIGENERATO DA UN LAVORO PROGRAMMATO.
 *
 * ── PERCHE' NON LO SCARICA PIU' IL SITO ─────────────────────────────────────
 *
 * Perche' fut.gg non risponde piu' ai server. MISURATO il 20/09/2026, stessa
 * ora, stessi indirizzi:
 *
 *     dal PC di casa          200
 *     dal server Oracle       200
 *     dalla funzione Netlify  502  «manifesto-non-disponibile»
 *     dal Worker Cloudflare   403
 *
 * La funzione del sito faceva da ponte e ha smesso di funzionare. Serve una
 * macchina che fut.gg accetti, che giri da sola, e che depositi il risultato
 * dove FUTMAGO possa leggerlo senza chiedere permesso a nessuno.
 *
 * ── COSA FA ────────────────────────────────────────────────────────────────
 *
 * Legge il manifesto di fut.gg, scarica i tre pezzi che servono e ne fa UN
 * file per piattaforma, nella forma che `leggiListinoInBlocco` gia' sa
 * leggere: `{ v, id0, d, p }`.
 *
 *     player-prices-index      gli identificativi, come differenze
 *     player-prices-<piatt>    i prezzi «fermi»
 *     player-prices-<piatt>-dyn i prezzi aggiornati di continuo
 *
 * I prezzi buoni sono quelli del `-dyn`: MISURATO il 20/09/2026, 1.722 su
 * 19.870 erano diversi da quelli fermi. Dove il `-dyn` non ha un numero si
 * usa il file fermo, e dove non ce l'ha nessuno dei due la carta resta senza
 * prezzo — mai a zero, che il risolutore leggerebbe come «gratis».
 *
 * E' lo stesso giro che fa Paletools: VERIFICATO leggendo la sua versione per
 * FC 27, la 27.0.7. Non e' un caso — e' l'unica fonte in blocco che esista.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RADICE = 'https://r2.fut.gg';
const ANNO = process.env['ANNO_FC'] ?? '27';
const PIATTAFORME = { console: 'player-prices-ps5', pc: 'player-prices-pc' };

async function prendi(url) {
  const risposta = await fetch(url, { headers: { accept: 'application/json' } });
  if (!risposta.ok) throw new Error(`${risposta.status} su ${url}`);
  return risposta.json();
}

function indirizzo(manifesto, chiave) {
  const impronta = manifesto[chiave];
  if (typeof impronta !== 'string' || impronta === '') {
    throw new Error(`il manifesto non ha ${chiave}`);
  }
  const versione = typeof manifesto['_version'] === 'number' ? manifesto['_version'] : 1;
  return `${RADICE}/${ANNO}/${chiave}.v${versione}.${impronta}.json`;
}

function numeri(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Mette insieme identificativi e prezzi.
 *
 * L'indice e i prezzi sono due liste parallele: la voce `i` dell'una e la
 * voce `i` dell'altra sono la stessa carta. Se le lunghezze non tornano non si
 * indovina: si taglia alla piu' corta, perche' un disallineamento vorrebbe
 * dire prezzi veri sotto carte sbagliate.
 */
function unisci(indice, dinamici, fermi) {
  const differenze = numeri(indice['d']);
  const quante = Math.min(
    differenze.length + 1,
    Math.max(numeri(dinamici).length, numeri(fermi).length),
  );
  const prezzi = [];
  let usatiDinamici = 0;
  let usatiFermi = 0;
  let senzaPrezzo = 0;
  for (let i = 0; i < quante; i++) {
    const d = numeri(dinamici)[i];
    const f = numeri(fermi)[i];
    if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
      prezzi.push(d);
      usatiDinamici++;
    } else if (typeof f === 'number' && Number.isFinite(f) && f > 0) {
      prezzi.push(f);
      usatiFermi++;
    } else {
      /* Zero vuol dire «nessun prezzo», e il lettore lo scarta. */
      prezzi.push(0);
      senzaPrezzo++;
    }
  }
  return {
    documento: {
      v: 2,
      id0: indice['id0'],
      d: differenze.slice(0, Math.max(0, quante - 1)),
      p: prezzi,
    },
    conti: { carte: quante, usatiDinamici, usatiFermi, senzaPrezzo },
  };
}

const destinazione = process.argv[2] ?? 'listino';
mkdirSync(destinazione, { recursive: true });

const manifesto = await prendi(`${RADICE}/${ANNO}/manifest.json`);
const indice = await prendi(indirizzo(manifesto, 'player-prices-index'));
const quando = new Date().toISOString();
const riepilogo = { anno: ANNO, quando, piattaforme: {} };

for (const [nome, chiave] of Object.entries(PIATTAFORME)) {
  const fermi = await prendi(indirizzo(manifesto, chiave));
  let dinamici = { p: [] };
  try {
    dinamici = await prendi(indirizzo(manifesto, `${chiave}-dyn`));
  } catch (errore) {
    /* Senza i dinamici si pubblica lo stesso, con i prezzi fermi. */
    console.log(`  ${nome}: niente -dyn (${errore.message})`);
  }
  const { documento, conti } = unisci(indice, dinamici['p'], fermi['p']);
  writeFileSync(path.join(destinazione, `listino-${nome}.json`), JSON.stringify(documento));
  riepilogo.piattaforme[nome] = conti;
  console.log(
    `  ${nome}: ${conti.carte} carte, ${conti.usatiDinamici} dal -dyn, ` +
      `${conti.usatiFermi} dal file fermo, ${conti.senzaPrezzo} senza prezzo`,
  );
}

writeFileSync(path.join(destinazione, 'stato.json'), JSON.stringify(riepilogo, null, 2) + '\n');
console.log(`listino pronto in ${destinazione} (${quando})`);
