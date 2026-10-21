# Salento Oggi

Le notizie del giorno dai giornali del Salento in un'app web installabile (PWA): gratuita, senza pubblicità, popup o registrazione.

Design: `docs/superpowers/specs/2026-10-14-app-news-salento-design.md` · Piano: `docs/superpowers/plans/2026-10-14-app-news-salento.md`

## Come funziona

```
GitHub Actions (ogni 30 minuti)
  └─ collector/  legge i feed RSS elencati in collector/sources.json
       └─ scrive app/data/news.json (ultime 72 ore, massimo 300 notizie)
  └─ scripts/stamp.py  versiona il service worker e imposta l'indirizzo del sito
  └─ pubblica la cartella app/ su GitHub Pages

app/  legge solo data/news.json, mai i siti dei giornali; funziona anche offline
```

Se una fonte non risponde, restano le sue ultime notizie valide e le altre continuano ad aggiornarsi. Lo stato di ogni fonte è in `sources_status` dentro `news.json` e si vede nella schermata Fonti.

## Fonti (verificate il 19 ottobre 2026)

| Fonte | Stato |
|---|---|
| Corriere Salentino | **attiva** · feed RSS pubblico; il `robots.txt` non vieta `/feed/` |
| TeleRama News (trnews.it) | **attiva** · feed RSS 2.0 pubblico; il `robots.txt` consente `/feed/`. Il feed ha l'anteprima vuota, quindi le schede mostrano titolo, immagine e fonte. Il sito non ha termini d'uso, solo «Tutti i diritti sono riservati»: se la testata lo chiede si disattiva |
| Il Post, Valigia Blu, IrpiMedia, Altreconomia | **attive come fonti nazionali** (21 ottobre 2026) · feed RSS 2.0 pubblici, scaricati senza blocchi da uno strumento che rispetta i `robots.txt` (i file non sono stati letti direttamente); nessuno dichiara condizioni d'uso, Altreconomia chiude gli articoli con «© riproduzione riservata». Compaiono solo nel filtro «Italia e mondo». Il Post mette l'immagine dentro la descrizione; Valigia Blu e IrpiMedia non hanno immagini |
| Il Fatto Quotidiano | non aggiunta · il sito blocca l'accesso automatico |
| LeccePrima | non aggiunta · il sito rifiuta le richieste automatiche e non risulta un feed pubblico con condizioni d'uso |
| Taranto Buonasera, Antenna Sud, Il7 Magazine | non aggiunte · il loro `robots.txt` vieta l'accesso automatico |
| Il Grande Salento, BrindisiReport, Senza Colonne | non verificate · i siti non hanno risposto ai controlli |

**Brindisi e Taranto** non hanno ancora una testata verificata: oggi le notizie con quelle zone arrivano solo dalle fonti sopra, quando citano i loro comuni. Un feed regionale (ad esempio di una TV pugliese) andrebbe filtrato, altrimenti porterebbe notizie di tutta la Puglia.

## Aggiungere o togliere una fonte

Basta modificare `collector/sources.json`, senza toccare il codice:

```json
{ "name": "Nome della testata", "feed": "https://esempio.it/feed/", "enabled": true }
```

- Una testata nazionale o internazionale (non legata al Salento) si marca con `"scope": "national"`: le sue notizie prendono la zona `Italia`, compaiono solo nel filtro «Italia e mondo» e non nel riepilogo; ne vengono tenute al massimo 100, a parte, così non scacciano quelle locali. Senza `scope` la fonte è locale e la zona si deduce dai comuni citati.
- Per togliere una fonte, anche su richiesta della testata, metti `"enabled": false`: le sue notizie spariscono al prossimo aggiornamento.
- Il collector legge feed **RSS 2.0**. Se una fonte usa Atom serve prima aggiungere il supporto, con un test.
- Per una fonte nuova salva in `collector/tests/fixtures/` un feed d'esempio e aggiungi un test che verifichi titolo, indirizzo e data.
- Per assegnare la zona (Lecce, Brindisi, Taranto) i comuni sono in `collector/zones.json`; la mappa delle categorie è in `collector/categories.json`.

## Regole sui contenuti delle testate

- Si mostrano solo titolo, anteprima breve (massimo 200 caratteri), immagine, nome della fonte e il link all'articolo originale. Il testo completo non viene mai copiato o ripubblicato, anche se il feed lo contiene.
- Una fonte entra solo se offre un feed pubblico e i suoi termini d'uso lo consentono.
- Non si aggirano blocchi anti-bot: se un sito rifiuta le richieste automatiche, non si aggiunge.
- Se una testata chiede di essere rimossa, si disattiva subito.

## Sviluppo in locale

```sh
python3 -m unittest discover -s collector/tests -t .   # test del collector
npm test                                                # test dell'app (Node 20 o superiore)
python3 -m collector.pipeline                           # scarica le notizie in app/data/news.json
python3 -m http.server -d app 8000                      # apri http://localhost:8000
```

Il collector usa solo la libreria standard di Python: non c'è nulla da installare.

## Pubblicazione

1. Crea un repository su GitHub (gratuito) e carica questo progetto sul ramo `main`.
2. In **Settings → Pages**, imposta **Source: GitHub Actions**.
3. In **Actions**, lancia a mano il workflow «Raccogli notizie e pubblica» (`workflow_dispatch`).
4. Alla fine l'app è su `https://<utente>.github.io/<repository>/`. Con un dominio proprio, imposta la variabile del repository `SITE_URL` (Settings → Variables) con l'indirizzo completo, senza `/` finale: serve per le anteprime dei link su WhatsApp.
5. Controlla che `sources_status` indichi `ok: true` per ogni fonte. Il primo scaricamento reale avviene qui, non in locale.

## Da verificare su un telefono vero

Installazione sulla schermata Home (iPhone e Android), tema scuro, apertura in modalità aereo, condivisione di una notizia e del riepilogo «Il Salento in 5 notizie» su WhatsApp.
