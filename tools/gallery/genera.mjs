/**
 * Dal JSON scaricato al modulo TypeScript che FUTMAGO imbarca.
 *
 * Due passi separati apposta: scaricare tocca la rete e puo' andare storto,
 * generare no. Cosi' si puo' rigenerare il codice da un catalogo gia' letto
 * senza rifare centoventisei richieste a fut.gg.
 *
 * Uso:  node tools/gallery/genera.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const NOMI_CATEGORIA = {
  '/fut-gallery/premier-league/': 'Premier League / Barclays WSL',
  '/fut-gallery/laliga/': 'LALIGA EA SPORTS / Liga F Moeve',
  '/fut-gallery/bundesliga/': 'Bundesliga / Frauen-Bundesliga',
  '/fut-gallery/ligue-1/': "Ligue 1 McDonald's / Arkema PL",
  '/fut-gallery/serie-a/': 'Serie A Enilive',
  '/fut-gallery/leagues/': 'Leghe',
  '/fut-gallery/rarities/': 'Rarita',
};

/** Un apostrofo in «Ligue 1 McDonald's» spezzerebbe la stringa TypeScript. */
function protetto(testo) {
  return String(testo).split('\\').join('\\\\').split("'").join("\\'");
}

/*
 * Album che FUTMAGO non mostra. POTM: DECISO dall'utente l'11/10/2026, «sono
 * tutti SBC, puoi anche non metterlo» — e su fut.gg non ha nemmeno il numero
 * di carte richieste.
 */
const ESCLUSI = new Set(['/fut-gallery/rarities/potm/']);

const catalogo = JSON.parse(readFileSync('tools/gallery/gallery-fc27.json', 'utf8')).filter(
  (set) => !ESCLUSI.has(set.id),
);
const gemelle = JSON.parse(readFileSync('tools/gallery/gemelle.json', 'utf8'));

/**
 * I CLUB DI UN ALBUM: UNO, O DUE.
 *
 * ── PERCHE' NON BASTA QUELLO DEL DISTINTIVO ────────────────────────────────
 *
 * SEGNALATO dall'utente il 26/09/2026: nell'album del Real Madrid mancavano le
 * carte della squadra femminile. Succedeva su trentotto album su centoventisei.
 *
 * In EA la squadra femminile di un club e' un club a se': il Chelsea maschile
 * e' il 5, quello femminile il 116010. Sulle pagine di fut.gg invece il
 * distintivo in cima e' uno solo — e l'album li accetta tutti e due.
 *
 * Gli identificativi delle coppie li dice `gemelle.json`, misurato chiedendo
 * le carte a EA una squadra per volta.
 *
 * ── E NON E' QUESTIONE DI QUANTE CARTE SERVONO ─────────────────────────────
 *
 * CHIESTO dall'utente il 01/10/2026: «le squadre che richiedono 20 carte
 * anziche' 15 sono quelle che possono richiedere sia maschili sia femminili?».
 *
 * CONTROLLATO su tutti i centodieci album di club: no, e non ci somiglia
 * nemmeno. Trentatre album sono misti, e venticinque di questi chiedono
 * quindici carte — Aston Villa, Tottenham, Everton, Brighton, Lione. Due
 * album da venti carte, Liverpool e Real Madrid, oggi mostrano solo uomini.
 * Le venti carte sono dei club grossi, che di carte ne hanno piu' di tutti.
 *
 * ── PERCHE' LE LEGHE DELLA PAGINA NON DECIDONO ─────────────────────────────
 *
 * Perche' dicono quali carte SONO USCITE, non quali l'album accetta, e cio'
 * che e' uscito cambia ogni settimana. MISURATO il 01/10/2026 leggendo le
 * pagine vere:
 *
 *   - Liverpool e Real Madrid mostrano solo uomini. Hanno la squadra
 *     femminile in EA, ma stasera non ne e' uscita una carta. Il 26/09 il
 *     Real Madrid era il caso che l'utente aveva segnalato: la pagina mostrava
 *     due leghe. Fidarsi della pagina vuol dire perdere l'album quando le
 *     carte femminili finiscono, e ritrovarlo quando ne esce una.
 *   - RC Lens e Crystal Palace il 26/09 mostravano solo donne, e per questo
 *     erano finiti fra gli album di sole giocatrici. Oggi mostrano ventisei e
 *     diciassette carte maschili: non erano album di sole donne, era la
 *     fotografia di quella sera.
 *
 * Quindi decide la COPPIA, che e' un fatto del gioco e non della settimana: se
 * un club ha la sua squadra femminile, l'album prende entrambe. Un album con
 * la squadra femminile ancora senza carte non perde niente ad averla nel
 * filtro — e il giorno che EA la pubblica, compare da sola.
 *
 * L'unica cosa che la pagina decide ancora e' il caso opposto: un album che
 * mostra SOLO leghe femminili e' un album di sole giocatrici — il Birmingham e
 * il Charlton stanno nello scaffale della Premier League senza avere una
 * squadra maschile nel gioco, e metterci il club maschile lo riempirebbe di
 * uomini che in quell'album non entrano.
 */

/** Maschile -> femminile, da tutte e due le tabelle misurate. */
const COPPIA = new Map();
for (const [maschile, femminile] of Object.entries(gemelle.coppie)) {
  COPPIA.set(Number(maschile), femminile);
}
for (const [maschile, femminile] of Object.entries(gemelle.soloFemminile)) {
  /*
   * Anche queste sono coppie: la tabella delle sole giocatrici tiene il club
   * maschile come chiave e il femminile come valore. Serve a RC Lens e a
   * Crystal Palace, che di coppia ne hanno una pur non stando in `coppie`.
   */
  if (!COPPIA.has(Number(maschile))) COPPIA.set(Number(maschile), femminile);
}

const senzaCoppia = [];

function clubDelSet(set) {
  const uno = Number(set.club) || 0;
  if (uno === 0) return [];

  /*
   * ── PRIMA DI TUTTO, IL REQUISITO DI EA ─────────────────────────────────
   *
   * SEGNALATO il 13/10/2026: il West Ham accetta solo la squadra femminile, e
   * FUTMAGO proponeva anche i maschili. Il requisito lo scrive (`genere`, da
   * `scarica.mjs`): «Women's», «Mens» o «Mens or Womens». Quando c'e' decide
   * lui; le leghe qui sotto restano solo per una pagina che non lo dicesse.
   */
  const maschileDi = (id) => gemelle.femminileVersoMaschile[String(id)] ?? id;
  const femminileDi = (id) => {
    const m = maschileDi(id);
    return COPPIA.get(m) ?? gemelle.soloFemminile[String(m)] ?? (m !== id ? id : undefined);
  };
  if (set.genere === 'uomini') {
    /* Il distintivo puo' essere della squadra femminile: le carte dicono quella maschile. */
    const m = maschileDi(uno);
    const femminiliNote = new Set([...COPPIA.values(), ...Object.values(gemelle.soloFemminile)]);
    if (femminiliNote.has(m) && set.clubUomini?.length === 1) return [set.clubUomini[0]];
    return [m];
  }
  if (set.genere === 'donne') {
    const f = femminileDi(uno);
    /* Un club che esiste solo come squadra femminile (London City, Wolfsburg) ha gia' l'id giusto. */
    if (f !== undefined) return [f];
    /* Album nuovo, coppia sconosciuta: il numero lo dicono le carte della pagina. */
    if (set.clubDonne?.length === 1) return [set.clubDonne[0]];
    const tuttiFemminili = new Set([...COPPIA.values(), ...Object.values(gemelle.soloFemminile)]);
    if (!tuttiFemminili.has(uno) && (set.leghe ?? []).some((l) => !gemelle.legheFemminili.includes(l))) {
      senzaCoppia.push(`${set.nome} (club ${uno}): solo donne, ma la squadra femminile non e' in gemelle.json`);
    }
    return [uno];
  }
  if (set.genere === 'entrambi') {
    /* Bayern e Strasburgo hanno lo stemma femminile: se la tabella non lo sa, lo dicono le carte. */
    let m = maschileDi(uno);
    if ((set.clubDonne ?? []).includes(m) && set.clubUomini?.length === 1) m = set.clubUomini[0];
    const f = COPPIA.get(m) ?? (set.clubDonne?.length === 1 ? set.clubDonne[0] : undefined);
    if (f !== undefined) return [m, f].sort((a, b) => a - b);
    senzaCoppia.push(`${set.nome} (club ${uno}): uomini e donne, ma la coppia non e' in gemelle.json`);
    return [m];
  }

  const leghe = set.leghe ?? [];
  const femminili = new Set(gemelle.legheFemminili);
  const soloDonne = leghe.length > 0 && leghe.every((l) => femminili.has(l));

  /* Album di sole giocatrici: il club e' uno, e la tabella dice quale. */
  if (soloDonne) return [gemelle.soloFemminile[String(uno)] ?? uno];

  /* Il distintivo puo' essere quello femminile: la chiave e' il maschile. */
  const maschile = gemelle.femminileVersoMaschile[String(uno)] ?? uno;
  const femminile = COPPIA.get(maschile);
  if (femminile !== undefined) return [maschile, femminile].sort((a, b) => a - b);

  /*
   * Nessuna coppia conosciuta. Se la pagina mostra comunque delle donne, EA ha
   * aggiunto una squadra femminile che `gemelle.json` non conosce: va misurata
   * a mano, e intanto si grida.
   */
  if (leghe.some((l) => femminili.has(l))) senzaCoppia.push(`${set.nome} (club ${uno})`);
  return [maschile];
}

const righe = catalogo.map((set) => {
  const id = set.id.replace(/^\/fut-gallery\//, '').replace(/\/$/, '');
  const gradi = set.gradi
    .map(
      (g) =>
        `{ lettera: '${g.lettera}', soglia: ${g.soglia}, premio: '${protetto(g.premio)}' }`,
    )
    .join(', ');
  const categoria = NOMI_CATEGORIA[set.categoria] ?? set.categoria;
  return (
    `  { id: '${id}', nome: '${protetto(set.nome)}', categoria: '${protetto(categoria)}', ` +
    `clubs: [${clubDelSet(set).join(', ')}], lega: ${set.lega}, richieste: ${set.richieste}, ` +
    (Array.isArray(set.rarita) && set.rarita.length > 0 ? `rarita: [${set.rarita.join(', ')}], ` : '') +
    `gradi: [${gradi}] },`
  );
});

/*
 * ── ANCHE COME DATI, PER IL LAVORO DI OGNI GIORNO ─────────────────────────
 *
 * CHIESTO l'11/10/2026: il catalogo che si aggiorna da solo.
 * `node genera.mjs --json <file>` scrive le stesse voci come JSON, che il
 * lavoro su GitHub pubblica e FUTMAGO scarica all'avvio (vedi
 * `caricaCatalogoGalleria` in `gallery-ea.ts`). Senza `--json` si scrive il
 * modulo TypeScript che FUTMAGO imbarca, come sempre.
 */
const comeDati = process.argv.indexOf('--json');
if (comeDati >= 0) {
  const voci = catalogo.map((set) => ({
    id: set.id.replace(/^\/fut-gallery\//, '').replace(/\/$/, ''),
    nome: set.nome,
    categoria: NOMI_CATEGORIA[set.categoria] ?? set.categoria,
    clubs: clubDelSet(set),
    lega: set.lega,
    richieste: set.richieste,
    ...(Array.isArray(set.rarita) && set.rarita.length > 0 ? { rarita: set.rarita } : {}),
    gradi: set.gradi.map((g) => ({ lettera: g.lettera, soglia: g.soglia, premio: g.premio })),
  }));
  const destinazione = process.argv[comeDati + 1] ?? 'catalogo-fc27.json';
  writeFileSync(
    destinazione,
    JSON.stringify({ versione: 1, generato: new Date().toISOString(), album: voci }),
    'utf8',
  );
  process.stderr.write(`scritti ${voci.length} album in ${destinazione}\n`);
} else {
  const intestazione = readFileSync('tools/gallery/intestazione.txt', 'utf8');
  writeFileSync(
    'packages/gallery/src/catalogo-fc27.ts',
    intestazione + righe.join('\n') + '\n];\n',
    'utf8',
  );
  process.stderr.write(`scritte ${righe.length} righe in packages/gallery/src/catalogo-fc27.ts\n`);
}

if (senzaCoppia.length > 0) {
  process.stderr.write(
    `ATTENZIONE: ${senzaCoppia.length} album mostrano carte femminili senza una coppia in gemelle.json:\n`,
  );
  for (const a of senzaCoppia) process.stderr.write(`   ${a}\n`);
  process.stderr.write('  Vanno misurate con searchConceptItems e aggiunte a mano.\n');
}
