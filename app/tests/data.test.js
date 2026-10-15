import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNews } from "../js/data.js";

const good = (n = 1) => ({
  id: `id${n}`, title: `Titolo ${n}`, summary: "s", image: null, url: `https://x.example/${n}`,
  source: "Fonte", category: "Cronaca", zone: "Lecce", published_at: "2026-10-14T10:00:00+00:00",
});

test("parseNews: dati assenti o di tipo sbagliato danno notizie vuote", () => {
  for (const raw of [null, undefined, "", 42, [], "testo"]) {
    assert.deepEqual(parseNews(raw), { updatedAt: null, items: [], sources: [] }, String(raw));
  }
});

test("parseNews: news.json iniziale (items vuoti) è valido", () => {
  assert.deepEqual(parseNews({ updated_at: null, items: [], sources_status: [] }), { updatedAt: null, items: [], sources: [] });
});

test("parseNews: scarta le voci senza campi essenziali e tiene le altre", () => {
  const news = parseNews({
    updated_at: "2026-10-14T10:30:00+00:00",
    items: [good(1), { ...good(2), url: "" }, { ...good(3), title: undefined }, null, "x", { ...good(4), id: 7 }, good(5)],
    sources_status: [{ source: "Fonte", ok: true, last_ok: "2026-10-14T10:30:00+00:00" }, { ok: true }, null],
  });
  assert.deepEqual(news.items.map((i) => i.id), ["id1", "id5"]);
  assert.equal(news.updatedAt, "2026-10-14T10:30:00+00:00");
  assert.deepEqual(news.sources, [{ source: "Fonte", ok: true, last_ok: "2026-10-14T10:30:00+00:00" }]);
});

test("parseNews: items non array e campi opzionali mancanti non rompono nulla", () => {
  assert.deepEqual(parseNews({ items: "boh" }).items, []);
  const [it] = parseNews({ items: [{ id: "a", title: "T", url: "https://x.example", source: "S" }] }).items;
  assert.equal(it.summary, "");
  assert.equal(it.image, null);
  assert.equal(it.category, "Altro");
  assert.equal(it.zone, "Salento");
  assert.equal(it.published_at, "");
});
