/*
 * Il catalogo si pubblica solo se e' sano: altrimenti FUTMAGO continua con
 * quello del giorno prima. Una pagina di fut.gg cambiata non deve diventare
 * una Gallery vuota per tutti.
 */
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const album = Array.isArray(d.album) ? d.album : [];
const rotti = album.filter(
  (a) =>
    typeof a.id !== 'string' ||
    typeof a.nome !== 'string' ||
    !Array.isArray(a.clubs) ||
    !Array.isArray(a.gradi) ||
    a.gradi.length !== 5,
);
if (album.length < 100 || rotti.length > 0) {
  console.error(`catalogo NON sano: ${album.length} album, ${rotti.length} rotti`);
  process.exit(1);
}
console.log(`catalogo sano: ${album.length} album`);
