# Il listino prezzi di FUTMAGO

Questo repository non contiene codice di FUTMAGO: contiene **un lavoro
programmato** che ogni quarto d'ora rigenera il listino dei prezzi e lo
pubblica sul ramo [`dati`](../../tree/dati).

    https://raw.githubusercontent.com/Ilmagodifut/futmago-listino/dati/listino-console.json
    https://raw.githubusercontent.com/Ilmagodifut/futmago-listino/dati/listino-pc.json

## Perche' esiste

Il listino lo serviva una funzione del sito, che scaricava da fut.gg. Ha
smesso di funzionare: fut.gg non risponde piu' ai server. Misurato il
20/09/2026, stessa ora, stessi indirizzi:

| da dove | esito |
|---|---|
| un computer qualunque | 200 |
| il server Oracle dei bot | 200 |
| la funzione Netlify del sito | 502 |
| il Worker Cloudflare | 403 |

Serviva quindi una macchina che fut.gg accetti e che giri da sola. In piu',
da quando il sito e' a crediti, ogni pubblicazione su Netlify ne costa 15:
qui non si tocca il sito e non si spende niente.

## Cosa c'e' dentro il file

La forma che FUTMAGO sa gia' leggere (`leggiListinoInBlocco`):

    { "v": 2, "id0": 27, "d": [ …differenze fra un id e il successivo… ], "p": [ …prezzi… ] }

Uno zero in `p` vuol dire **nessun prezzo**, non «gratis»: chi legge lo
scarta. Il ramo `dati` viene rifatto a ogni esecuzione, cosi' il repository
non cresce.
