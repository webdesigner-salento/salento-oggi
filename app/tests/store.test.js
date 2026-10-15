import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, getBrowserStorage } from "../js/store.js";

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}
const quotaError = () => { throw new DOMException("quota", "QuotaExceededError"); };

test("createStore: salva e rilegge valori JSON, anche con un nuovo store sullo stesso storage", () => {
  const storage = fakeStorage();
  createStore(storage).set("saved", [{ id: "a" }]);
  assert.deepEqual(createStore(storage).get("saved", []), [{ id: "a" }]);
});

test("createStore: valore mancante o JSON corrotto danno il fallback", () => {
  const store = createStore(fakeStorage({ rotto: "{non json" }));
  assert.deepEqual(store.get("assente", []), []);
  assert.equal(store.get("rotto", "fb"), "fb");
});

test("createStore: setItem che lancia (quota piena) → il valore resta leggibile nella sessione", () => {
  const storage = { ...fakeStorage(), setItem: quotaError };
  const store = createStore(storage);
  assert.equal(store.set("k", { a: 1 }), false);
  assert.deepEqual(store.get("k", null), { a: 1 });
});

test("createStore: getItem che lancia → fallback, nessuna eccezione", () => {
  const storage = { ...fakeStorage(), getItem: () => { throw new Error("blocked"); } };
  assert.equal(createStore(storage).get("k", 42), 42);
});

test("createStore: storage null → funziona solo in memoria", () => {
  const store = createStore(null);
  assert.equal(store.get("k", "fb"), "fb");
  assert.equal(store.set("k", ["x"]), false);
  assert.deepEqual(store.get("k", []), ["x"]);
});

test("createStore: il valore restituito è una copia", () => {
  const store = createStore(null);
  store.set("k", { list: [1] });
  store.get("k").list.push(2);
  assert.deepEqual(store.get("k"), { list: [1] });
});

test("getBrowserStorage: null se l'accesso a localStorage lancia o se scrivere fallisce", () => {
  const throwing = { get localStorage() { throw new Error("SecurityError"); } };
  assert.equal(getBrowserStorage(throwing), null);
  assert.equal(getBrowserStorage({ localStorage: { ...fakeStorage(), setItem: quotaError } }), null);
  assert.equal(getBrowserStorage({}), null);
});

test("getBrowserStorage: restituisce lo storage se funziona", () => {
  const storage = fakeStorage();
  assert.equal(getBrowserStorage({ localStorage: storage }), storage);
});
