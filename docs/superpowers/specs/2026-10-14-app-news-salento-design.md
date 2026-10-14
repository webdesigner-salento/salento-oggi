# App news Salento — Design

Data: 2026-10-14
Nome di lavoro: **Salento Oggi** (provvisorio, modificabile)
Stato: bozza da rivedere

## 1. Obiettivo

Creare un'app gratuita che raccoglie le notizie del giorno dai giornali locali del Salento, con una grafica curata e senza pubblicità, clickbait, popup o registrazione obbligatoria.

Il problema che risolve (dalle parole dell'utente): le app di news esistenti hanno pubblicità, clickbait e paywall, trascurano le notizie locali e hanno interfacce brutte o complicate.

Obiettivo dell'utente: risolvere un problema concreto; la diffusione virale è un bonus, favorita dal passaparola locale e dalla condivisione su WhatsApp.

Criteri di successo:
- L'app si apre in meno di 2 secondi e funziona anche offline con le ultime notizie salvate.
- Le notizie si aggiornano da sole almeno ogni 30 minuti, a costo zero.
- Ogni notizia rimanda alla pagina originale della testata.
- Si può aggiungere una fonte modificando una riga di configurazione.

## 2. Territorio e fonti

Territorio: tutto il Salento (provincia di Lecce, parte centro-meridionale di quella di Brindisi, parte orientale di quella di Taranto).

Fonti indicate dall'utente:
- Corriere Salentino — feed RSS pubblico verificato (`https://www.corrieresalentino.it/feed/`), aggiornato ogni ora, con titolo, categoria, autore, data, anteprima e immagine.
- LeccePrima — feed non ancora verificato (l'accesso automatico è stato bloccato dal sito).
- Telerama (TeleRama News, trnews.it) — feed non ancora verificato.
- Altre testate gratuite da individuare in fase di realizzazione (candidata: Il Grande Salento).

Regole sulle fonti:
- Si mostrano solo titolo, anteprima breve (massimo 200 caratteri), immagine, nome della fonte e link all'articolo originale. Il testo completo non viene mai copiato o ripubblicato, anche se il feed lo contiene.
- Una fonte entra nell'app solo se offre un feed pubblico e i suoi termini d'uso lo consentono. Non si aggirano blocchi anti-bot.
- Una testata che chiede di essere rimossa si disattiva con una riga di configurazione.

## 3. Piattaforma e architettura

Piattaforma di partenza: PWA (app web installabile su iPhone e Android). Le app native negli store sono fuori dalla prima versione.

Approccio scelto dall'utente: sito statico con aggiornamento automatico.

Due componenti, collegati solo da un file:

1. **Raccoglitore** (script Python, eseguito da GitHub Actions con pianificazione ogni 30 minuti)
   - Legge l'elenco delle fonti da `sources.json`.
   - Scarica ogni feed RSS, normalizza i campi, tronca le anteprime, toglie i doppioni (stesso link o titolo quasi identico), ordina per data decrescente.
   - Assegna la zona (Lecce, Brindisi, Taranto o Salento generico) cercando i nomi dei comuni nel titolo, nell'anteprima e nei tag.
   - Mappa le categorie delle fonti su un insieme comune: Cronaca, Politica, Sport, Eventi, Cultura, Economia, Salute, Altro.
   - Scrive `news.json` e lo pubblica nel repository.
2. **App** (HTML, CSS e JavaScript senza fase di build)
   - Legge solo `news.json` e lo mette in cache con un service worker.
   - Non chiama mai direttamente i siti dei giornali.

Hosting: repository GitHub con pubblicazione su GitHub Pages (alternativa: Cloudflare Pages). Costo zero.

## 4. Dati: `news.json`

```json
{
  "updated_at": "2026-10-14T12:30:00+02:00",
  "items": [
    {
      "id": "hash-del-link",
      "title": "…",
      "summary": "… (max 200 caratteri)",
      "image": "https://…",
      "url": "https://…",
      "source": "Corriere Salentino",
      "category": "Cronaca",
      "zone": "Lecce",
      "published_at": "2026-10-13T22:45:22+00:00"
    }
  ],
  "sources_status": [
    { "source": "Corriere Salentino", "ok": true, "last_ok": "2026-10-14T12:30:00+02:00" }
  ]
}
```

Si conservano le notizie delle ultime 72 ore, con un massimo di 300 voci.

## 5. Schermate

1. **Oggi:** schede con immagine, titolo, fonte e "x minuti fa". In alto il selettore di zona (Tutto il Salento, Lecce, Brindisi, Taranto) e sotto una barra scorrevole di categorie.
2. **Preferiti:** notizie salvate, memorizzate sul telefono. Si salva una copia completa della scheda, così la notizia resta disponibile anche dopo che esce da `news.json` (che conserva solo 72 ore).
3. **Fonti:** elenco delle testate con interruttore per attivarle o disattivarle (preferenza salvata sul telefono).
4. **Il Salento in 5 notizie:** scheda giornaliera riassuntiva, raggiungibile dalla Home.

L'ora dell'ultimo aggiornamento è sempre visibile.

## 6. Grafica

- Stile editoriale pulito, molto spazio bianco, immagini grandi.
- Un solo colore d'accento ispirato al Salento: terracotta.
- Tema chiaro e scuro automatici in base al telefono.
- Nessuna pubblicità, popup o registrazione.
- Animazioni leggere. Immagine mancante o rotta: segnaposto con il colore della fonte.

## 7. Condivisione e diffusione

- **Condividi notizia:** usa la condivisione nativa del telefono (Web Share API) con titolo e link dell'articolo originale. L'anteprima in WhatsApp è quella generata dalla testata.
- **Il Salento in 5 notizie:** scheda immagine generata nel browser (canvas) con le 5 notizie più recenti provenienti da fonti diverse, condivisa con un tocco insieme al link dell'app. La selezione è per recenza e varietà di fonte, non per importanza.
- **Link dell'app:** ha un'anteprima curata (titolo, descrizione e immagine Open Graph) quando viene incollato in WhatsApp.
- **Invito all'installazione:** mostrato una sola volta, dopo la terza visita.

## 8. Gestione degli errori

- Fonte non raggiungibile o formato cambiato: il raccoglitore mantiene le ultime notizie valide di quella fonte, registra l'errore in `sources_status` e prosegue con le altre.
- Job fallito del tutto: resta il `news.json` precedente e l'app mostra l'ora dell'ultimo aggiornamento.
- Nessuna connessione: l'app si apre dalla cache e mostra le ultime notizie salvate.
- Feed vuoto o malformato: viene ignorato senza interrompere il job.

## 9. Test

- Test automatici sul raccoglitore: lettura di feed d'esempio (inclusa una copia del feed reale di Corriere Salentino), eliminazione dei doppioni, assegnazione di zona e categoria, troncamento delle anteprime, feed vuoto, feed malformato, fonte irraggiungibile.
- Controllo automatico che l'app carichi e mostri le schede con un `news.json` di prova, anche vuoto.
- Verifica manuale su iPhone e Android prima della pubblicazione (installazione, tema scuro, modalità offline, condivisione).

## 10. Fuori dalla prima versione

Account utente, commenti, notifiche push, ricerca, app negli store, riassunti generati con intelligenza artificiale.

## 11. Verifiche da fare durante la realizzazione

Queste non bloccano il design, ma vanno chiuse prima di attivare le rispettive fonti:
- Individuare un feed pubblico di LeccePrima e di Telerama (TeleRama News) e leggerne i termini d'uso. Se una delle due non offre un feed utilizzabile, partire senza di essa.
- Individuare almeno altre due testate gratuite con feed pubblico per coprire Brindisi e Taranto.
- Verificare che l'invio dei feed da parte di GitHub Actions non venga bloccato da nessuna fonte.
