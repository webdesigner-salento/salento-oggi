import { test } from "node:test";
import assert from "node:assert/strict";
import { filterItems, pickTopFive, timeAgo } from "../js/filters.js";

const NOW = new Date("2026-10-14T12:00:00+00:00");
const mk = (n, over = {}) => ({
  id: `id${n}`, title: `Notizia ${n}`, summary: "", image: null, url: `https://x.example/${n}`,
  source: "Fonte A", category: "Cronaca", zone: "Lecce",
  published_at: new Date(NOW.getTime() - n * 60_000).toISOString(), ...over,
});

test("filterItems: Tutto/Tutte non filtra nulla", () => {
  const items = [mk(1), mk(2, { zone: "Brindisi" }), mk(3, { category: "Sport" })];
  assert.equal(filterItems(items, { zone: "Tutto", category: "Tutte", disabledSources: [] }).length, 3);
  assert.equal(filterItems(items).length, 3);
});

test("filterItems: la zona include anche le notizie Salento generiche ed esclude le altre zone", () => {
  const items = [mk(1, { zone: "Lecce" }), mk(2, { zone: "Brindisi" }), mk(3, { zone: "Salento" })];
  const ids = filterItems(items, { zone: "Lecce" }).map((i) => i.id);
  assert.deepEqual(ids, ["id1", "id3"]);
});

test("filterItems: filtra per categoria", () => {
  const items = [mk(1), mk(2, { category: "Sport" })];
  assert.deepEqual(filterItems(items, { category: "Sport" }).map((i) => i.id), ["id2"]);
});

test("filterItems: nasconde le fonti disattivate", () => {
  const items = [mk(1), mk(2, { source: "Fonte B" })];
  assert.deepEqual(filterItems(items, { disabledSources: ["Fonte B"] }).map((i) => i.id), ["id1"]);
});

test("filterItems: combina i filtri e non modifica l'input", () => {
  const items = [mk(1), mk(2, { category: "Sport" }), mk(3, { zone: "Taranto", category: "Sport" })];
  const copy = structuredClone(items);
  const out = filterItems(items, { zone: "Lecce", category: "Sport" });
  assert.deepEqual(out.map((i) => i.id), ["id2"]);
  assert.deepEqual(items, copy);
  assert.notEqual(out, items);
});

test("pickTopFive: privilegia fonti diverse, poi completa con le più recenti", () => {
  const items = [
    mk(1, { source: "A" }), mk(2, { source: "A" }), mk(3, { source: "A" }), mk(4, { source: "A" }),
    mk(5, { source: "A" }), mk(6, { source: "B" }), mk(7, { source: "C" }),
  ];
  const ids = pickTopFive(items).map((i) => i.id);
  assert.equal(ids.length, 5);
  assert.ok(ids.includes("id6") && ids.includes("id7"));
  assert.deepEqual(ids, ["id1", "id2", "id3", "id6", "id7"]);
});

test("pickTopFive: con una sola fonte prende le 5 più recenti", () => {
  const items = [mk(9), mk(3), mk(1), mk(7), mk(2), mk(5), mk(4)];
  assert.deepEqual(pickTopFive(items).map((i) => i.id), ["id1", "id2", "id3", "id4", "id5"]);
});

test("pickTopFive: meno di 5 voci e lista vuota", () => {
  assert.deepEqual(pickTopFive([mk(2), mk(1)]).map((i) => i.id), ["id1", "id2"]);
  assert.deepEqual(pickTopFive([]), []);
});

test("pickTopFive: date mancanti o non valide vanno in fondo senza rompere l'ordine", () => {
  const items = [mk(1, { published_at: "boh" }), mk(2, { published_at: null }), mk(3)];
  assert.equal(pickTopFive(items)[0].id, "id3");
  assert.equal(pickTopFive(items).length, 3);
});

test("timeAgo: confini", () => {
  const ago = (ms) => timeAgo(new Date(NOW.getTime() - ms).toISOString(), NOW);
  const S = 1000, M = 60 * S, H = 60 * M;
  assert.equal(ago(0), "adesso");
  assert.equal(ago(59 * S), "adesso");
  assert.equal(ago(60 * S), "1 min fa");
  assert.equal(ago(59 * M), "59 min fa");
  assert.equal(ago(60 * M), "1 h fa");
  assert.equal(ago(23 * H + 59 * M), "23 h fa");
  assert.equal(ago(24 * H), "ieri");
  assert.equal(ago(47 * H + 59 * M), "ieri");
  assert.equal(ago(48 * H), "2 g fa");
  assert.equal(ago(71 * H), "2 g fa");
  assert.equal(ago(72 * H), "3 g fa");
});

test("timeAgo: futuro (orologi sfasati) e data non valida non rompono nulla", () => {
  assert.equal(timeAgo(new Date(NOW.getTime() + 5 * 60_000).toISOString(), NOW), "adesso");
  assert.equal(timeAgo("boh", NOW), "");
  assert.equal(timeAgo(null, NOW), "");
});
