/**
 * IL CATALOGO DELLA GALLERY DI FC 27, PRESO DA FUT.GG.
 *
 * ── PERCHE' NON DA EA ──────────────────────────────────────────────────────
 *
 * Perche' EA non lo da'. CERCATO il 21/09/2026 sulla Web App vera:
 * `AssetLocationUtils` ha cinquantuno funzioni, una per ogni file che il
 * client usa — rarita', squadre, ricerca giocatori, cosmetici — e nessuna per
 * la collezione. In `config/companion/` i nomi plausibili danno 404.
 * `services.Showcase` esiste ma ha un metodo solo, e non serve dati.
 *
 * La Gallery e' roba del gioco su console: la Web App ne conosce solo i due
 * campi che FUTMAGO gia' usa, `isCollected` e `gradingScore`.
 *
 * ── PERCHE' FUT.GG ─────────────────────────────────────────────────────────
 *
 * Perche' e' gia' la nostra fonte per i prezzi, e perche' pubblica il
 * catalogo per intero: centoventisei set, per ognuno le carte richieste, le
 * cinque soglie e i cinque premi. E perche' ogni pagina porta l'identificativo
 * EA del club nell'indirizzo dell'immagine — `2027/club/88` — che e' l'unico
 * modo di legare il loro catalogo alle squadre che la Web App dichiara.
 *
 * ── PERCHE' UN FILE E NON UNA CHIAMATA ─────────────────────────────────────
 *
 * Perche' queste soglie non cambiano: sono i traguardi di un anno di gioco.
 * Scaricarle a ogni apertura sarebbe una dipendenza da un sito che puo'
 * cadere, per un dato che e' fermo. Si scarica qui, si controlla, e diventa
 * codice nostro.
 *
 * Uso:  node tools/gallery/scarica.mjs
 */
import { writeFile } from 'node:fs/promises';

const RADICE = 'https://www.fut.gg';
const PAUSA_MS = 350;

const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Tre tentativi. MISURATO il 15/10/2026: la Juventus ha risposto 502 una
 * volta, e un album saltato sparisce dal catalogo di tutti fino al giorno dopo.
 */
async function pagina(percorso) {
  for (let tentativo = 1; ; tentativo++) {
    const risposta = await fetch(RADICE + percorso, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (risposta.ok) return risposta.text();
    if (tentativo >= 3) throw new Error(`${percorso}: ${risposta.status}`);
    await aspetta(3000 * tentativo);
  }
}

/** Il testo di un frammento di HTML, senza tag e senza spazi doppi. */
function testo(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .join('\n');
}

/** Gli indirizzi dei set, presi dalle pagine di categoria. */
async function indirizzoDeiSet() {
  const indice = await pagina('/fut-gallery/');
  const categorie = [
    ...new Set(
      [...indice.matchAll(/href="(\/fut-gallery\/[a-z0-9-]+\/)"/g)].map((m) => m[1]),
    ),
  ].filter((c) => c !== '/fut-gallery/' && !c.includes('/tags/'));

  const set = new Map();
  for (const categoria of categorie) {
    await aspetta(PAUSA_MS);
    const html = await pagina(categoria);
    const linkati = [];
    for (const m of html.matchAll(/href="(\/fut-gallery\/[a-z0-9-]+\/[a-z0-9-]+\/)"/g)) {
      linkati.push(m[1]);
      if (!set.has(m[1])) set.set(m[1], categoria);
    }
    /*
     * ── ANCHE I SET CHE LA PAGINA NON LINKA ───────────────────────────────
     *
     * TROVATO il 15/10/2026 confrontando con FUTGenie (128 set, noi 126):
     * la pagina della LaLiga mostra 24 link, ma nei suoi dati ci sono anche
     * SD Eibar e Granada CF. Si leggono dai dati (`categoryId`, `slug`), solo
     * quelli della stessa categoria dei set linkati.
     */
    const categoriaDi = new Map();
    for (const m of html.matchAll(/categoryId:(\d+),name:"(?:[^"\\]|\\.)*",slug:"([a-z0-9-]+)"/g)) {
      categoriaDi.set(m[2], m[1]);
    }
    const qui = new Set(
      linkati.map((l) => categoriaDi.get(l.split('/').filter(Boolean).pop())).filter((c) => c !== undefined),
    );
    for (const [slug, cid] of categoriaDi) {
      const percorso = `${categoria}${slug}/`;
      if (qui.has(cid) && !set.has(percorso)) set.set(percorso, categoria);
    }
    process.stderr.write(`${categoria} -> ${set.size} set finora\n`);
  }
  return set;
}

/**
 * Legge una pagina di set.
 *
 * Tollerante: un set che non si capisce viene saltato con un avviso invece di
 * far fallire tutto il giro. Centoventicinque set buoni valgono piu' di zero.
 */
function leggiSet(htmlIntero, percorso, categoria) {
  /*
   * In fondo a ogni pagina c'e' «More in this category» con gli altri set e i
   * loro stemmi. PRESO SUL VIVO: senza tagliare li', i set delle rarita' —
   * che uno stemma proprio non ce l'hanno — si prendevano quello del primo
   * vicino, e Holographics risultava un club della Bundesliga.
   */
  const taglio = htmlIntero.indexOf('More in this category');
  const html = taglio > 0 ? htmlIntero.slice(0, taglio) : htmlIntero;
  const t = testo(html);

  const nome = (/^([^\n]+) FUT Gallery Set/m.exec(t) ?? [])[1];
  if (nome === undefined) return null;

  /*
   * Gli album di club scrivono «Requires 15 players»; quelli di rarita'
   * «Requires Heroes players to complete», senza numero. TROVATO l'11/10/2026:
   * Olografiche, Heroes, TOTW e Season 1 risultavano a 0, e FUTMAGO contava
   * tutte le carte invece della formazione (5, 5, 20, 10). Il numero c'e'
   * comunque nel riquadro della formazione: «0 / 5 players done».
   */
  const richieste = Number(
    ((/Requires\s+([\d,]+)\s/.exec(t) ?? /\/\s*([\d,]+)\s*players done/.exec(t) ?? [])[1] ?? '0').replace(/,/g, ''),
  );

  /*
   * L'identificativo EA: sta nell'indirizzo dell'immagine dello stemma. Un
   * set di club porta `2027/club/<id>`, uno di lega `2027/league/<id>`.
   */
  const club = Number((/2027\/club\/(\d+)\./.exec(html) ?? [])[1] ?? 0);
  const lega = Number((/2027\/league\/(\d+)\./.exec(html) ?? [])[1] ?? 0);

  /*
   * ── TUTTE LE LEGHE, NON SOLO LA PRIMA ──────────────────────────────────
   *
   * SEGNALATO il 01/10/2026: «aprendo il Chelsea ci sono solo i maschili».
   * Vero, e la colpa e' di questo file.
   *
   * In EA la squadra femminile di un club e' un club a se' — Chelsea maschile
   * e' il 5, quello femminile il 116010 — e l'unico segnale che un album li
   * accetta entrambi e' che la sua pagina mostri DUE leghe: la Premier League
   * e la Barclays WSL.
   *
   * Quelle due leghe le avevo raccolte a mano il 26/09 con uno script di
   * misura, e sono finite dentro il file dei dati. Qui pero' non c'erano: il
   * giro normale ne leggeva UNA SOLA. Cosi' rigenerando il catalogo il
   * 30/09 — per tutt'altra ragione — trentaquattro album hanno perso in
   * silenzio la squadra femminile.
   *
   * Un dato raccolto una volta a mano e' un dato che si perde: adesso lo
   * raccoglie il giro normale, e `tests/gallery-club.test.ts` grida se un
   * album con due leghe torna ad avere un club solo.
   *
   * VERIFICATO sulla pagina del Chelsea: «leghe: 2216,13».
   *
   * ── E SI LEGGONO SULLA PAGINA INTERA ────────────────────────────────────
   *
   * Non sul pezzo tagliato prima di «More in this category», che e' quello da
   * cui si prende lo stemma: MISURATO, i distintivi delle leghe stanno sulle
   * CARTE, e le carte vengono dopo quel taglio. Cercandoli li' non se ne
   * trovava nemmeno uno — ed e' il motivo per cui questa correzione, al primo
   * tentativo, non ha corretto niente.
   *
   * Sulla pagina intera il rischio sarebbe raccogliere le leghe degli album
   * suggeriti in fondo, ma quelli mostrano STEMMI DI CLUB: le leghe che si
   * leggono qui sono quelle delle carte di questo album.
   */
  const leghe = [
    ...new Set([...htmlIntero.matchAll(/2027\/league\/(\d+)\./g)].map((m) => Number(m[1]))),
  ].sort((a, b) => a - b);

  /*
   * La tabella dei gradi. Le righe sono «lettera, punteggio, premio», e si
   * leggono in quell'ordine dal testo della tabella.
   */
  const inizio = testo(htmlIntero).indexOf('Grade requirements');
  if (inizio < 0) return null;
  const coda = testo(htmlIntero).slice(inizio, inizio + 1200);
  const gradi = [];
  for (const lettera of ['D', 'C', 'B', 'A', 'S']) {
    const regola = new RegExp(`^${lettera}\\n([\\d.,]+)\\n([^\\n]+)`, 'm');
    const trovato = regola.exec(coda);
    if (trovato === null) continue;
    const soglia = Number(trovato[1].replace(/[.,]/g, ''));
    if (!Number.isFinite(soglia)) continue;
    gradi.push({ lettera, soglia, premio: trovato[2].trim() });
  }
  if (gradi.length !== 5) return null;

  /*
   * ── LE RARITA' DELL'ALBUM, DAL SUO REQUISITO ──────────────────────────────
   *
   * SEGNALATO l'11/10/2026: Season 1 conteneva solo Destined for Glory. Le
   * rarita' degli album di rarita' erano un elenco scritto a mano dentro
   * FUTMAGO, e le Ones to Watch e le Future Stars non c'erano mai state messe.
   * La pagina invece lo dice: «Requires Ones to Watch, Destined for Glory or
   * Future Stars Player Items to complete». I nomi si traducono negli
   * identificativi EA con le rarita' del file dati di fut.gg (`rarita`).
   */
  const rarita = raritaDelRequisito(t);

  /*
   * ── UOMINI, DONNE O ENTRAMBI: LO DICE IL REQUISITO ────────────────────────
   *
   * SEGNALATO il 13/10/2026: nell'album del West Ham FUTMAGO proponeva anche
   * i giocatori maschili, ma il gioco accetta solo la squadra femminile.
   *
   * Le leghe delle carte mostrate (`leghe`) dicono cosa e' USCITO, non cosa
   * l'album accetta. Il requisito invece e' il testo di EA, e lo dice chiaro:
   * «Requires 15 West Ham Women's players», «Requires 15 Crystal Palace Mens
   * players», «Requires 20 Arsenal Mens or Womens players». CONTROLLATO su
   * tutti i centodieci album di club: sei erano sbagliati (West Ham,
   * Birmingham, Charlton, Norimberga solo donne; Crystal Palace e Lens solo
   * uomini).
   */
  const genere = genereDelRequisito(t);

  /*
   * ── E I NUMERI DELLE DUE SQUADRE, DALLE CARTE DELLA PAGINA ───────────────
   *
   * CHIESTO il 13/10/2026: «questa modifica si dovra' applicare anche ai
   * nuovi album». Il requisito dice uomini o donne, ma non il numero EA della
   * squadra femminile: per i club che conosciamo lo dice `gemelle.json`, per un
   * album nuovo no. La pagina pero' porta la formazione proposta da fut.gg,
   * carta per carta, con `gender` (1 uomo, 2 donna) e `clubEaId`. Da li' il
   * numero si legge da solo, e `genera.mjs` lo usa quando la tabella non lo sa.
   */
  const formazione = htmlIntero.slice(Math.max(0, htmlIntero.indexOf('solution:')));
  const clubDi = (g) => [
    ...new Set([...formazione.matchAll(new RegExp(`gender:${g},clubEaId:(\\d+)`, 'g'))].map((m) => Number(m[1]))),
  ];
  const clubUomini = clubDi(1);
  const clubDonne = clubDi(2);

  return {
    id: percorso, nome, categoria, club, lega, leghe, richieste,
    ...(genere ? { genere } : {}),
    ...(clubUomini.length > 0 ? { clubUomini } : {}),
    ...(clubDonne.length > 0 ? { clubDonne } : {}),
    ...(rarita.length > 0 ? { rarita } : {}),
    gradi,
  };
}

/** 'entrambi' | 'donne' | 'uomini', oppure null se il requisito non lo dice. */
function genereDelRequisito(t) {
  const frase = /Requires\s+[\d,]+\s+([^\n]+?)\s+players\b/.exec(t);
  if (frase === null) return null;
  const chi = frase[1];
  if (/\bMen'?s\s+(?:or|and)\s+Women'?s$/i.test(chi)) return 'entrambi';
  if (/\bWomen'?s$/i.test(chi)) return 'donne';
  if (/\bMen'?s$/i.test(chi)) return 'uomini';
  return null;
}

/** Nome della rarita' (fut.gg, in minuscolo) -> identificativo EA. Lo riempie `principale`. */
const RARITA_PER_NOME = new Map();

function raritaDelRequisito(t) {
  const frase = /Requires ([^\n.]+?) (?:Player Items|players) to complete/.exec(t);
  if (frase === null || /^[\d,]+$/.test(frase[1])) return [];
  const nomi = frase[1].split(/,\s*|\s+or\s+|\s+and\s+/).map((n) => n.trim().toLowerCase()).filter(Boolean);
  const trovate = [];
  for (const nome of nomi) {
    /* Prima il nome esatto («future stars», non «future stars academy»); poi al singolare («heroes» -> «base hero»). */
    let id = RARITA_PER_NOME.get(nome);
    if (id === undefined) {
      const radice = nome.replace(/(es|s)$/, '');
      for (const [n, v] of RARITA_PER_NOME) if (n === radice || n.endsWith(' ' + radice)) id = v;
    }
    if (id !== undefined && !trovate.includes(id)) trovate.push(id);
  }
  return trovate;
}

async function caricaRarita() {
  const manifesto = await (await fetch('https://r2.fut.gg/27/manifest.json')).json();
  const dati = await (await fetch(`https://r2.fut.gg/27/fc-core-data.v${manifesto._version ?? 1}.${manifesto['fc-core-data']}.json`)).json();
  for (const r of dati.rarities ?? []) {
    if (typeof r.name === 'string' && Number.isFinite(r.eaId) && r.eaId >= 0) RARITA_PER_NOME.set(r.name.toLowerCase(), r.eaId);
  }
}

async function principale() {
  await caricaRarita();
  const indirizzi = await indirizzoDeiSet();
  process.stderr.write(`${indirizzi.size} set da leggere\n`);

  const set = [];
  const saltati = [];
  for (const [percorso, categoria] of indirizzi) {
    await aspetta(PAUSA_MS);
    try {
      const letto = leggiSet(await pagina(percorso), percorso, categoria);
      if (letto === null) saltati.push(percorso);
      else set.push(letto);
    } catch (errore) {
      saltati.push(`${percorso} (${errore.message})`);
    }
  }

  process.stderr.write(`letti ${set.length}, saltati ${saltati.length}\n`);
  for (const s of saltati) process.stderr.write(`  saltato: ${s}\n`);
  await writeFile('tools/gallery/gallery-fc27.json', JSON.stringify(set, null, 1), 'utf8');
  process.stderr.write('scritto tools/gallery/gallery-fc27.json\n');
}

await principale();
