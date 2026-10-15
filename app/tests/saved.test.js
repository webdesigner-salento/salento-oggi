import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../js/store.js";
import { filterItems } from "../js/filters.js";
import { getDisabledSources, getSaved, toggleSaved, toggleSource } from "../js/prefs.js";

const mk = (n, over = {}) => ({
  id: `id${n}`, title: `Notizia ${n}`, summary: `Anteprima ${n}`, image: `https://img.example/${n}.jpg`,
  url: `https://giornale.example/${n}`, source: "Corriere Salentino", category: "Cronaca", zone: "Lecce",
  published_at: "2026-10-14T10:00:00+00:00", ...over,
});

/** localStorage finto, condiviso tra più store per simulare la chiusura e la riapertura dell'app. */
const fakeStorage = (opts = {}) => {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { if (opts.failWrites) throw new Error("QuotaExceededError"); data.set(key, value); },
    raw: data,
  };
};

test("toggleSaved: salva con la scheda completa, poi rimuove; restituisce il nuovo stato", () => {
  const store = createStore(null);
  assert.equal(toggleSaved(store, mk(1)), true);
  assert.deepEqual(getSaved(store), [mk(1)]);
  assert.equal(toggleSaved(store, mk(1)), false);
  assert.deepEqual(getSaved(store), []);
});

test("toggleSaved: la stessa notizia non si duplica, anche se l'oggetto è una copia aggiornata", () => {
  const store = createStore(null);
  toggleSaved(store, mk(1));
  toggleSaved(store, mk(2));
  assert.equal(toggleSaved(store, { ...mk(1), title: "Titolo aggiornato dal giornale" }), false);
  assert.deepEqual(getSaved(store).map((i) => i.id), ["id2"]);
});

test("toggleSaved: l'ultima salvata compare per prima", () => {
  const store = createStore(null);
  toggleSaved(store, mk(1));
  toggleSaved(store, mk(2));
  toggleSaved(store, mk(3));
  assert.deepEqual(getSaved(store).map((i) => i.id), ["id3", "id2", "id1"]);
});

test("getSaved: un preferito resta disponibile dopo aver chiuso l'app, anche se non è più in news.json", () => {
  const storage = fakeStorage();
  toggleSaved(createStore(storage), mk(7, { title: "Titolo vecchio di giorni" }));
  const reopened = createStore(storage);
  assert.deepEqual(getSaved(reopened), [mk(7, { title: "Titolo vecchio di giorni" })]);
});

test("toggleSaved: salva una copia, le modifiche successive all'oggetto originale non la toccano", () => {
  const store = createStore(null);
  const item = mk(1);
  toggleSaved(store, item);
  item.title = "cambiato dopo";
  assert.equal(getSaved(store)[0].title, "Notizia 1");
});

test("senza localStorage o con scritture che falliscono funziona comunque nella sessione", () => {
  for (const store of [createStore(null), createStore(fakeStorage({ failWrites: true }))]) {
    assert.equal(toggleSaved(store, mk(1)), true);
    assert.deepEqual(getSaved(store).map((i) => i.id), ["id1"]);
    assert.deepEqual(toggleSource(store, "Telerama"), ["Telerama"]);
    assert.deepEqual(getDisabledSources(store), ["Telerama"]);
  }
});

test("getSaved: dati corrotti nel telefono vengono ignorati e non impediscono di salvare", () => {
  for (const junk of ["boh", 42, { a: 1 }, [null, 5, "x", { id: "senza-resto" }, { ...mk(1), url: "" }]]) {
    const store = createStore(null);
    store.set("saved", junk);
    assert.deepEqual(getSaved(store), [], JSON.stringify(junk));
    assert.equal(toggleSaved(store, mk(2)), true);
    assert.deepEqual(getSaved(store).map((i) => i.id), ["id2"]);
  }
});

test("getSaved: tiene le voci valide e scarta doppioni e voci rotte", () => {
  const store = createStore(null);
  store.set("saved", [mk(1), null, mk(1, { title: "doppione" }), { id: "x" }, mk(2)]);
  assert.deepEqual(getSaved(store).map((i) => [i.id, i.title]), [["id1", "Notizia 1"], ["id2", "Notizia 2"]]);
});

test("toggleSaved: una notizia senza i campi essenziali non viene salvata", () => {
  const store = createStore(null);
  for (const bad of [{}, null, undefined, { id: "a" }, { ...mk(1), url: "" }]) {
    assert.equal(toggleSaved(store, bad), false);
  }
  assert.deepEqual(getSaved(store), []);
});

test("toggleSource: disattiva e riattiva una fonte, restituendo l'elenco aggiornato", () => {
  const store = createStore(null);
  assert.deepEqual(getDisabledSources(store), []);
  assert.deepEqual(toggleSource(store, "Telerama"), ["Telerama"]);
  assert.deepEqual(toggleSource(store, "LeccePrima"), ["Telerama", "LeccePrima"]);
  assert.deepEqual(toggleSource(store, "Telerama"), ["LeccePrima"]);
  assert.deepEqual(getDisabledSources(store), ["LeccePrima"]);
});

test("toggleSource: nomi vuoti o non testuali e dati corrotti non rompono nulla", () => {
  const store = createStore(null);
  for (const name of ["", "   ", null, undefined, 5]) assert.deepEqual(toggleSource(store, name), []);
  store.set("disabledSources", ["Telerama", 5, null, "", "Telerama", { x: 1 }]);
  assert.deepEqual(getDisabledSources(store), ["Telerama"]);
  store.set("disabledSources", "boh");
  assert.deepEqual(getDisabledSources(store), []);
});

test("le fonti disattivate nascondono le schede e riattivandole tornano", () => {
  const store = createStore(null);
  const items = [mk(1), mk(2, { source: "Telerama" })];
  toggleSource(store, "Telerama");
  assert.deepEqual(filterItems(items, { disabledSources: getDisabledSources(store) }).map((i) => i.id), ["id1"]);
  toggleSource(store, "Telerama");
  assert.deepEqual(filterItems(items, { disabledSources: getDisabledSources(store) }).map((i) => i.id), ["id1", "id2"]);
});

test("le preferenze sopravvivono alla chiusura dell'app", () => {
  const storage = fakeStorage();
  toggleSource(createStore(storage), "Telerama");
  assert.deepEqual(getDisabledSources(createStore(storage)), ["Telerama"]);
});
