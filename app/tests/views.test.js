import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ZONE_OPTIONS, CATEGORY_OPTIONS, renderToday, renderSaved, renderSources, renderDigest,
} from "../js/views.js";

const NOW = new Date("2026-10-14T10:30:00Z");
const mk = (n, over = {}) => ({
  id: `id${n}`, title: `Notizia ${n}`, summary: `Anteprima ${n}`, image: `https://img.example/${n}.jpg`,
  url: `https://giornale.example/${n}`, source: "Corriere Salentino", category: "Cronaca", zone: "Lecce",
  published_at: new Date(NOW.getTime() - n * 60_000).toISOString(), ...over,
});
const count = (str, sub) => str.split(sub).length - 1;

test("opzioni: quattro zone e nove categorie con 'Tutto'/'Tutte' per prime", () => {
  assert.deepEqual(ZONE_OPTIONS.map((o) => o.value), ["Tutto", "Lecce", "Brindisi", "Taranto"]);
  assert.equal(ZONE_OPTIONS[0].label, "Tutto il Salento");
  assert.deepEqual(
    CATEGORY_OPTIONS.map((o) => o.value),
    ["Tutte", "Cronaca", "Politica", "Sport", "Eventi", "Cultura", "Economia", "Salute", "Altro"],
  );
});

test("renderToday: la notizia più recente è la scheda guida, le altre seguono in ordine di data", () => {
  const items = [mk(30), mk(5), mk(10)];
  const { feed } = renderToday({ items, now: NOW });
  assert.equal(count(feed, "<article"), 3);
  assert.equal(count(feed, "card--lead"), 1);
  assert.ok(feed.indexOf('data-id="id5"') < feed.indexOf('data-id="id10"'));
  assert.ok(feed.indexOf('data-id="id10"') < feed.indexOf('data-id="id30"'));
  assert.match(feed, /card--lead" data-id="id5"/);
});

test("renderToday: solo la scheda guida carica l'immagine con priorità", () => {
  const { feed } = renderToday({ items: [mk(1), mk(2), mk(3)], now: NOW });
  assert.equal(count(feed, 'fetchpriority="high"'), 1);
  assert.equal(count(feed, 'loading="lazy"'), 2);
});

test("renderToday: la zona include le notizie Salento generiche, la categoria e le fonti disattivate filtrano", () => {
  const items = [
    mk(1, { zone: "Lecce" }), mk(2, { zone: "Brindisi" }), mk(3, { zone: "Salento" }),
    mk(4, { zone: "Lecce", category: "Sport" }), mk(5, { zone: "Lecce", source: "Telerama" }),
  ];
  const ids = (html) => [...html.matchAll(/<article[^>]*data-id="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids(renderToday({ items, zone: "Lecce", now: NOW }).feed), ["id1", "id3", "id4", "id5"]);
  assert.deepEqual(ids(renderToday({ items, category: "Sport", now: NOW }).feed), ["id4"]);
  assert.deepEqual(ids(renderToday({ items, disabledSources: ["Telerama"], now: NOW }).feed), ["id1", "id2", "id3", "id4"]);
});

test("renderToday: segna come salvate solo le notizie in savedIds", () => {
  const { feed } = renderToday({ items: [mk(1), mk(2)], savedIds: ["id2"], now: NOW });
  assert.equal(count(feed, 'aria-pressed="true"'), 1);
  assert.match(feed, /data-id="id2"[^>]*aria-pressed="true"/);
});

test("renderToday: i filtri mostrano la zona e la categoria selezionate, una per gruppo", () => {
  const { filters } = renderToday({ items: [mk(1)], zone: "Taranto", category: "Sport", now: NOW });
  assert.equal(count(filters, 'aria-pressed="true"'), 2);
  assert.match(filters, /data-filter="zone" data-value="Taranto" aria-pressed="true"/);
  assert.match(filters, /data-filter="category" data-value="Sport" aria-pressed="true"/);
  assert.match(filters, /Tutto il Salento/);
});

test("renderToday: senza notizie invita a riprovare e non mostra schede", () => {
  const { feed } = renderToday({ items: [], now: NOW });
  assert.match(feed, /Nessuna notizia al momento/);
  assert.match(feed, /data-action="retry"/);
  assert.equal(count(feed, "<article"), 0);
});

test("renderToday: finché le notizie si stanno caricando mostra «Carico le notizie…», non «nessuna notizia»", () => {
  const { feed } = renderToday({ items: [], loading: true, now: NOW });
  assert.match(feed, /<p class="loading">Carico le notizie…<\/p>/);
  assert.doesNotMatch(feed, /Nessuna notizia/);
  assert.equal(count(feed, "<article"), 0);
});

test("renderToday: durante il caricamento le notizie già presenti restano visibili", () => {
  const { feed } = renderToday({ items: [mk(1)], loading: true, now: NOW });
  assert.equal(count(feed, "<article"), 1);
  assert.doesNotMatch(feed, /Carico le notizie/);
});

test("renderToday: a caricamento finito senza notizie invita a riprovare", () => {
  const { feed } = renderToday({ items: [], loading: false, now: NOW });
  assert.match(feed, /Nessuna notizia al momento/);
  assert.doesNotMatch(feed, /Carico le notizie/);
});

test("renderToday: filtri che escludono tutto offrono di tornare a Tutto", () => {
  const { feed } = renderToday({ items: [mk(1, { zone: "Lecce" })], zone: "Taranto", now: NOW });
  assert.match(feed, /Nessuna notizia con questi filtri/);
  assert.match(feed, /data-action="reset-filters"/);
  assert.equal(count(feed, "<article"), 0);
});

test("renderToday: tutte le fonti disattivate porta alla schermata Fonti", () => {
  const { feed } = renderToday({ items: [mk(1), mk(2)], disabledSources: ["Corriere Salentino"], now: NOW });
  assert.match(feed, /Tutte le fonti sono disattivate/);
  assert.match(feed, /data-action="go-sources"/);
  assert.doesNotMatch(feed, /reset-filters/);
});

test("renderSaved: vuota spiega come salvare; piena mostra schede salvate senza scheda guida", () => {
  const empty = renderSaved({ saved: [], now: NOW });
  assert.match(empty, /Nessun preferito/);
  assert.equal(count(empty, "<article"), 0);
  const full = renderSaved({ saved: [mk(1), mk(2)], now: NOW });
  assert.equal(count(full, "<article"), 2);
  assert.equal(count(full, 'aria-pressed="true"'), 2);
  assert.equal(count(full, "card--lead"), 0);
  assert.ok(full.indexOf('data-id="id1"') < full.indexOf('data-id="id2"'), "mantiene l'ordine ricevuto");
});

test("renderSaved: dati mancanti non rompono la schermata", () => {
  assert.match(renderSaved({ now: NOW }), /Nessun preferito/);
});

test("renderSources: una riga per fonte, interruttore spento per quelle disattivate", () => {
  const sources = [
    { source: "Corriere Salentino", ok: true, last_ok: "2026-10-14T10:30:00Z" },
    { source: "Telerama", ok: false, last_ok: null },
  ];
  const html = renderSources({ sources, disabledSources: ["Telerama"], timeZone: "Europe/Rome" });
  assert.equal(count(html, 'class="source-row"'), 2);
  assert.match(html, /data-source="Corriere Salentino" checked/);
  assert.doesNotMatch(html, /data-source="Telerama" checked/);
  assert.match(html, /Non risponde/);
});

test("renderSources: senza fonti spiega quando compariranno", () => {
  const html = renderSources({ sources: [] });
  assert.match(html, /Nessuna fonte disponibile/);
  assert.doesNotMatch(html, /source-row/);
});

test("renderDigest: cinque righe da fonti diverse, ignora le fonti disattivate", () => {
  const sources = ["A", "B", "C", "D", "E", "F"];
  const items = sources.map((s, i) => mk(i + 1, { source: s }));
  const html = renderDigest({ items, disabledSources: ["A"], now: NOW });
  assert.equal(count(html, 'class="digest-row"'), 5);
  assert.doesNotMatch(html, />A</);
  assert.match(html, /<ol class="digest">/);
});

test("renderDigest: con meno di cinque notizie ne mostra quante ce ne sono; senza notizie lo dice", () => {
  assert.equal(count(renderDigest({ items: [mk(1), mk(2)], now: NOW }), 'class="digest-row"'), 2);
  const empty = renderDigest({ items: [], now: NOW });
  assert.match(empty, /Nessuna notizia per oggi/);
  assert.doesNotMatch(empty, /digest-row/);
});

test("renderDigest: il pulsante per condividere il riepilogo c'è solo se ci sono notizie", () => {
  const full = renderDigest({ items: [mk(1), mk(2)], now: NOW });
  assert.equal(count(full, 'data-action="share-digest"'), 1);
  assert.ok(full.indexOf('data-action="share-digest"') < full.indexOf('<ol class="digest">'), "il pulsante sta sopra la lista");
  assert.doesNotMatch(renderDigest({ items: [], now: NOW }), /share-digest/);
});
