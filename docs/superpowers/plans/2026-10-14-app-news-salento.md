# App news Salento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire "Salento Oggi", una PWA gratuita che mostra le notizie dei giornali locali del Salento, alimentata da un raccoglitore automatico di feed RSS.

**Architecture:** Un raccoglitore Python (GitHub Actions, ogni 30 minuti) legge `sources.json`, scarica i feed, normalizza, deduplica e scrive `app/data/news.json`. L'app è HTML/CSS/JavaScript senza fase di build, legge solo quel file, lo mette in cache con un service worker e pubblica su GitHub Pages.

**Tech Stack:** Python 3.12 (`feedparser`, `requests`, `pytest`), JavaScript ES modules (test con `node --test`), GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-14-app-news-salento-design.md`

## Global Constraints

- Anteprima massima 200 caratteri; mai il testo completo dell'articolo.
- `news.json` conserva le notizie delle ultime 72 ore, massimo 300 voci.
- Raccoglitore pianificato ogni 30 minuti.
- Zone ammesse: `Lecce`, `Brindisi`, `Taranto`, `Salento` (generico).
- Categorie ammesse: `Cronaca`, `Politica`, `Sport`, `Eventi`, `Cultura`, `Economia`, `Salute`, `Altro`.
- Colore d'accento: terracotta; tema chiaro/scuro automatico (`prefers-color-scheme`).
- Nessuna pubblicità, popup, account o registrazione. Costo zero.
- L'app non chiama mai direttamente i siti dei giornali: legge solo `data/news.json`.
- Non si aggirano blocchi anti-bot; una fonte entra solo con feed pubblico e termini d'uso compatibili.
- Invito all'installazione: una sola volta, dopo la terza visita.
- Fuori dalla v1: account, commenti, notifiche push, ricerca, app negli store, riassunti con IA.

## Review Focus

- Notizia senza immagine → scheda con segnaposto del colore della fonte, nessuna immagine rotta.
- Data di pubblicazione mancante o non valida → la voce non rompe l'ordinamento (usa l'ora di raccolta).
- `news.json` assente, vuoto o con `items: []` al primo avvio → schermata "nessuna notizia", nessun errore.
- `localStorage` non disponibile (navigazione privata iOS) → l'app funziona, preferiti e fonti restano solo in memoria.
- Stessa notizia da due fonti con titolo che differisce per maiuscole, punteggio o spazi → una sola voce.

## File Structure

```
.github/workflows/collect.yml        # job pianificato + deploy Pages
collector/sources.json               # elenco fonti (modificabile senza toccare il codice)
collector/zones.json                 # comuni → zona
collector/categories.json            # mappa categorie fonte → categorie app
collector/normalize.py               # parsing feed, pulizia testo, id, anteprima
collector/enrich.py                  # dedupe, zona, categoria
collector/pipeline.py                # orchestrazione, fallback, scrittura news.json
collector/tests/                     # pytest + feed d'esempio in fixtures/
app/index.html, app/styles.css
app/manifest.webmanifest, app/sw.js, app/icons/
app/data/news.json                   # generato dal raccoglitore
app/js/store.js                      # accesso sicuro a localStorage
app/js/filters.js                    # filtri e selezione "5 notizie"
app/js/render.js                     # schede, segnaposto, tempo relativo
app/js/share.js                      # condivisione e scheda canvas
app/js/main.js                       # avvio, schermate, installazione
app/tests/*.test.js                  # node --test
README.md
```

---

### Task 1: Scheletro del repository e parsing dei feed

**Files:**
- Create: `collector/sources.json`, `collector/normalize.py`, `collector/tests/test_normalize.py`, `collector/tests/fixtures/corriere_salentino.xml`, `requirements.txt`, `.gitignore`
- Run: `git init` (la cartella non è ancora un repository)

**Interfaces:**
- Produces: `parse_feed(xml: bytes, source_name: str) -> list[dict]` — ogni dict ha le chiavi `id, title, summary, image, url, source, category_raw (list[str]), published_at (str ISO 8601 | None)`; `truncate_summary(text: str, limit: int = 200) -> str`; `make_id(url: str) -> str` (primi 12 caratteri dell'SHA-1 esadecimale dell'URL).

- [ ] **Step 1:** `git init`; creare `requirements.txt` (`feedparser`, `requests`, `pytest`) e `sources.json` con la sola voce `{"name": "Corriere Salentino", "feed": "https://www.corrieresalentino.it/feed/", "enabled": true}`. Salvare in `fixtures/corriere_salentino.xml` una copia ridotta (3 articoli) del feed reale.
- [ ] **Step 2: Scrivere i test falliti** in `test_normalize.py`:
  - `test_parse_feed_extracts_fields`: sul fixture, il primo item ha titolo, `source == "Corriere Salentino"`, `url` http(s), `image` non vuota, `category_raw` contiene `"Cronaca"` o altra categoria presente nel fixture.
  - `test_summary_is_plain_text_and_max_200`: nessun tag HTML né entità (`&#8230;`, `&#8211;`) nell'anteprima, `len <= 200`; se troncata termina con `…`.
  - `test_summary_never_contains_full_content`: l'anteprima non contiene il testo di `content:encoded` oltre i 200 caratteri.
  - `test_missing_image_gives_none`: item senza `media:content` né `<img>` → `image is None`.
  - `test_missing_or_invalid_date_gives_none`: `pubDate` assente o `"boh"` → `published_at is None`, nessuna eccezione.
  - `test_empty_or_malformed_feed_returns_empty_list`: `b""` e `b"<rss>"` → `[]`.
  - `test_make_id_is_stable_and_12_chars`.
- [ ] **Step 3:** Eseguire `pytest collector/tests/test_normalize.py -v`. Atteso: FAIL (modulo mancante).
- [ ] **Step 4:** Implementare `normalize.py` con `feedparser`. L'immagine si prende da `media_content`/`media_thumbnail`, altrimenti dal primo `<img src>` del contenuto. L'anteprima si ricava dal `summary` del feed, ripulito da HTML con `html.unescape` e rimozione tag.
- [ ] **Step 5:** Rieseguire i test. Atteso: tutti PASS.
- [ ] **Step 6:** Commit: `feat: collector feed parsing`.

### Task 2: Deduplica, zona e categoria

**Files:**
- Create: `collector/enrich.py`, `collector/zones.json`, `collector/categories.json`, `collector/tests/test_enrich.py`

**Interfaces:**
- Consumes: i dict di `parse_feed` (Task 1).
- Produces: `dedupe(items: list[dict]) -> list[dict]` (tiene la voce con data più recente; a parità la prima); `detect_zone(item: dict) -> str` (una delle zone ammesse); `map_category(raw: list[str]) -> str` (una delle categorie ammesse).

- [ ] **Step 1:** Creare `zones.json` come `{"Lecce": [...comuni...], "Brindisi": [...], "Taranto": [...]}` con i comuni salentini delle tre province (almeno: Lecce, Gallipoli, Otranto, Nardò, Galatina, Casarano, Maglie, Tricase, Copertino, Brindisi, Ostuni, Fasano, Francavilla Fontana, Mesagne, Taranto, Manduria, Grottaglie, Martina Franca). `categories.json` mappa parole delle fonti (`"cronaca"`, `"sport"`, `"spettacoli"` → `Eventi`, `"attualità"` → `Altro`, ecc.) sulle categorie ammesse.
- [ ] **Step 2: Scrivere i test falliti:**
  - `test_dedupe_same_url`.
  - `test_dedupe_title_differs_by_case_punctuation_spaces`: `"Lecce, Di Francesco perde Ilic"` e `"lecce  di francesco perde ilic!"` → una sola voce.
  - `test_dedupe_keeps_different_articles`.
  - `test_detect_zone_from_title`, `_from_summary`, `_from_category_tags`; `test_detect_zone_unknown_is_salento`; se compaiono comuni di zone diverse vince la prima presente nel titolo.
  - `test_map_category_known`, `test_map_category_unknown_is_altro`, `test_map_category_empty_list_is_altro`; prima categoria riconosciuta vince, con priorità `Cronaca` > `Politica` > `Sport` > altre.
- [ ] **Step 3:** Eseguire i test. Atteso: FAIL.
- [ ] **Step 4:** Implementare. Normalizzazione titolo per la deduplica: minuscolo, solo caratteri alfanumerici e spazi singoli.
- [ ] **Step 5:** Test PASS. Commit: `feat: dedupe, zone and category`.

### Task 3: Pipeline e `news.json`

**Files:**
- Create: `collector/pipeline.py`, `collector/tests/test_pipeline.py`, `app/data/news.json` (iniziale `{"updated_at": null, "items": [], "sources_status": []}`)

**Interfaces:**
- Consumes: `parse_feed`, `dedupe`, `detect_zone`, `map_category`.
- Produces: `build_news(sources: list[dict], previous: dict | None, fetch: Callable[[str], bytes], now: datetime) -> dict` con lo schema del paragrafo 4 della spec (`updated_at`, `items`, `sources_status`); `main() -> None` (legge `collector/sources.json` e `app/data/news.json`, scarica con `requests` timeout 20 s e User-Agent identificativo, scrive il risultato).

- [ ] **Step 1: Scrivere i test falliti** con `fetch` finto:
  - `test_builds_schema_and_sorts_desc`.
  - `test_failed_source_keeps_previous_items_and_marks_not_ok`: `fetch` solleva eccezione per una fonte → le sue voci precedenti restano, `sources_status[...]["ok"] is False`, `last_ok` invariato, le altre fonti aggiornate.
  - `test_all_sources_fail_keeps_previous_news`.
  - `test_drops_items_older_than_72h` e `test_caps_at_300_items` (le più recenti restano).
  - `test_item_without_date_uses_collection_time`.
  - `test_disabled_source_is_skipped_and_its_items_removed`.
  - `test_empty_feed_does_not_crash`.
  - `test_output_has_only_spec_fields` (nessun campo `content` o testo completo).
- [ ] **Step 2:** Eseguire. Atteso: FAIL. **Step 3:** Implementare `pipeline.py`. **Step 4:** Test PASS.
- [ ] **Step 5:** Eseguire `python -m collector.pipeline` una volta in locale: atteso `app/data/news.json` con notizie reali di Corriere Salentino, tutte con `summary` ≤ 200 caratteri.
- [ ] **Step 6:** Commit: `feat: collector pipeline`.

### Task 4: Automazione e pubblicazione

**Files:**
- Create: `.github/workflows/collect.yml`

**Interfaces:**
- Consumes: `python -m collector.pipeline` (Task 3).

- [ ] **Step 1:** Workflow con trigger `schedule: cron "*/30 * * * *"`, `workflow_dispatch` e `push` su `main`. Job: installa Python 3.12 e `requirements.txt`, esegue `pytest collector/tests`, esegue il raccoglitore, fa commit di `app/data/news.json` solo se cambiato, poi pubblica la cartella `app/` su GitHub Pages (`actions/upload-pages-artifact` + `actions/deploy-pages`, permessi `contents: write`, `pages: write`, `id-token: write`).
- [ ] **Step 2:** Validare la sintassi con `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/collect.yml'))"`. Atteso: nessun errore.
- [ ] **Step 3:** Commit: `ci: scheduled collector and pages deploy`. (Il primo run reale richiede il repository su GitHub: vedi Task 9.)

### Task 5: Logica dell'app (filtri, archivio, tempo)

**Files:**
- Create: `app/js/filters.js`, `app/js/store.js`, `app/tests/filters.test.js`, `app/tests/store.test.js`

**Interfaces:**
- Produces:
  - `filterItems(items: Item[], opts: {zone: string, category: string, disabledSources: string[]}) -> Item[]` — `zone: "Tutto"` e `category: "Tutte"` significano nessun filtro; `zone: "Lecce"` include anche voci con zona `Salento`.
  - `pickTopFive(items: Item[]) -> Item[]` — le 5 più recenti con fonti diverse (se le fonti sono meno di 5, completa con le più recenti restanti).
  - `timeAgo(iso: string, now: Date) -> string` ("adesso", "12 min fa", "3 h fa", "ieri", "2 g fa").
  - `createStore(storage: Storage | null) -> {get(key, fallback), set(key, value)}` — se `storage` è `null` o solleva eccezioni, usa una `Map` in memoria.
- [ ] **Step 1: Test falliti:** filtro per zona (con `Salento` incluso), per categoria, per fonti disattivate; `pickTopFive` con meno di 5 voci, con una sola fonte, con voci vuote; `timeAgo` ai confini; `createStore` con `localStorage` funzionante, con `setItem` che lancia `QuotaExceededError`, con `null`.
- [ ] **Step 2:** `node --test app/tests/` → FAIL. **Step 3:** Implementare. **Step 4:** PASS. **Step 5:** Commit: `feat: app logic`.

### Task 6: Schermate e grafica

**Files:**
- Create: `app/index.html`, `app/styles.css`, `app/js/render.js`, `app/js/main.js`, `app/tests/render.test.js`

**Interfaces:**
- Consumes: `filterItems`, `timeAgo`, `createStore` (Task 5), `data/news.json`.
- Produces: `renderCard(item: Item, opts: {saved: boolean, now: Date}) -> string` (HTML); `renderPlaceholder(source: string) -> string`; `escapeHtml(s: string) -> string`.

- [ ] **Step 1: Test falliti** in `render.test.js`: `renderCard` con immagine; senza immagine → contiene il segnaposto e nessun `<img src="null">`; titolo con `<script>` o `"` viene escapato; titolo molto lungo non rompe il markup; stato `saved` visibile.
- [ ] **Step 2:** FAIL → **Step 3:** implementare `render.js`.
- [ ] **Step 4:** Costruire le quattro schermate in `index.html`/`main.js`: Oggi (selettore zona: Tutto il Salento, Lecce, Brindisi, Taranto; barra categorie; schede con immagine, titolo, fonte, `timeAgo`), Preferiti, Fonti, "Il Salento in 5 notizie". Mostrare sempre l'ora dell'ultimo aggiornamento. Gestire `news.json` assente/vuoto con messaggio "Nessuna notizia al momento". Ogni scheda si apre con `target="_blank" rel="noopener"` sull'URL originale.
- [ ] **Step 5:** `styles.css`: variabili CSS per il terracotta (`--accent`), tema chiaro e scuro con `prefers-color-scheme`, tipografia editoriale, immagini grandi con `aspect-ratio` fisso per evitare salti di layout, nessun popup. Usare la skill `frontend-design` per la qualità visiva.
- [ ] **Step 6:** `node --test app/tests/` PASS; avviare `python -m http.server -d app 8000` e verificare a mano Home, filtri, tema scuro, news vuote.
- [ ] **Step 7:** Commit: `feat: app screens and design`.

### Task 7: Preferiti e Fonti

**Files:**
- Modify: `app/js/main.js`, `app/js/render.js`
- Test: `app/tests/saved.test.js`

**Interfaces:**
- Produces: `toggleSaved(store, item: Item) -> boolean` e `getSaved(store) -> Item[]` (chiave `saved`, copia completa della scheda); `toggleSource(store, name: string) -> string[]` e `getDisabledSources(store) -> string[]` (chiave `disabledSources`).

- [ ] **Step 1: Test falliti:** salvare, rimuovere, salvare due volte la stessa notizia non duplica; un preferito resta disponibile anche se non è più in `news.json`; fonti disattivate nascondono le schede; con `store` in memoria (storage assente) tutto funziona nella sessione.
- [ ] **Step 2:** FAIL → **Step 3:** implementare e collegare ai pulsanti ⭐ e agli interruttori della schermata Fonti (l'elenco fonti deriva da `sources_status`). **Step 4:** PASS + verifica manuale. **Step 5:** Commit: `feat: favorites and source toggles`.

### Task 8: Condivisione e "Il Salento in 5 notizie"

**Files:**
- Create: `app/js/share.js`, `app/tests/share.test.js`
- Modify: `app/js/main.js`

**Interfaces:**
- Consumes: `pickTopFive` (Task 5).
- Produces: `shareItem(item: Item) -> Promise<"shared" | "copied" | "unsupported">` (usa `navigator.share` con titolo e URL originale; altrimenti copia il link negli appunti); `layoutDigestLines(items: Item[], maxWidth: number, measure: (text: string) => number) -> string[][]` (spezza i titoli in righe per la scheda); `renderDigestCanvas(items: Item[], date: Date) -> Promise<Blob>`.

- [ ] **Step 1: Test falliti:** `shareItem` con `navigator.share` simulato, senza `share` (copia), senza clipboard (`"unsupported"`), utente che annulla (nessun errore mostrato); `layoutDigestLines` con titolo lunghissimo e con parola più larga della riga.
- [ ] **Step 2:** FAIL → **Step 3:** implementare. La scheda canvas riporta data, le 5 notizie con fonte e il link dell'app; si condivide come file immagine con `navigator.share({files})` quando supportato, altrimenti si scarica.
- [ ] **Step 4:** PASS; verifica manuale su telefono reale (WhatsApp).
- [ ] **Step 5:** Commit: `feat: sharing and daily digest`.

### Task 9: PWA, installazione, anteprima del link e pubblicazione

**Files:**
- Create: `app/manifest.webmanifest`, `app/sw.js`, `app/icons/` (192 e 512 px, maskable), `README.md`
- Modify: `app/index.html`, `app/js/main.js`
- Test: `app/tests/sw.test.js`

**Interfaces:**
- Produces: `sw.js` con strategia *stale-while-revalidate* per `data/news.json` e *cache-first* per l'app shell; `shouldShowInstallPrompt(visits: number, alreadyShown: boolean) -> boolean` in `main.js` (vero solo alla terza visita e una volta sola).

- [ ] **Step 1: Test falliti:** `shouldShowInstallPrompt(2,false) === false`, `(3,false) === true`, `(3,true) === false`, `(10,true) === false`; il `sw.js` non mette in cache richieste verso domini diversi dal proprio.
- [ ] **Step 2:** FAIL → **Step 3:** implementare. Manifest: nome "Salento Oggi", `display: standalone`, colore tema terracotta. Meta Open Graph e Twitter (titolo, descrizione, immagine 1200×630) in `index.html`.
- [ ] **Step 4:** Verifica con Lighthouse (PWA installabile, nessun errore di service worker); in modalità aereo l'app si apre con le ultime notizie salvate.
- [ ] **Step 5:** `README.md`: come aggiungere o togliere una fonte, come funziona l'aggiornamento, regole sui contenuti delle testate.
- [ ] **Step 6:** Creare il repository su GitHub, attivare Pages (sorgente: GitHub Actions), lanciare `workflow_dispatch` e verificare che l'app pubblicata mostri notizie reali. Provare su iPhone e Android: installazione, tema scuro, offline, condivisione.
- [ ] **Step 7:** Commit: `feat: pwa, install prompt, open graph`.

### Task 10: Verifica e attivazione delle altre fonti

**Files:**
- Modify: `collector/sources.json`, `collector/zones.json`

- [ ] **Step 1:** Per LeccePrima, Telerama (TeleRama News, trnews.it) e almeno due testate di Brindisi e Taranto (candidata: Il Grande Salento): cercare il feed RSS pubblico dal sito e leggere i termini d'uso. Se la fonte blocca i download automatici o non consente la riutilizzazione di titoli e anteprime, non aggiungerla e annotarlo nel `README.md`.
- [ ] **Step 2:** Per ogni fonte approvata: aggiungere una voce a `sources.json`, salvare in `fixtures/` un feed d'esempio e aggiungere un test `test_parse_feed_<fonte>` che verifichi titolo, URL e data.
- [ ] **Step 3:** Rieseguire `pytest collector/tests` (PASS), lanciare il workflow e controllare che ogni nuova fonte compaia in `sources_status` con `ok: true`.
- [ ] **Step 4:** Commit: `feat: add verified sources`.
