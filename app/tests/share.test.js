import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutDigestLines, shareDigest, shareItem } from "../js/share.js";

const item = (over = {}) => ({ title: "Incendio a Mesagne", url: "https://giornale.example/a", source: "Corriere Salentino", ...over });
const abort = () => Object.assign(new Error("cancelled"), { name: "AbortError" });
const denied = () => Object.assign(new Error("denied"), { name: "NotAllowedError" });

/** Registra le chiamate fatte a navigator.share e a clipboard.writeText. */
const fakeNavigator = ({ share, clipboard, canShare } = {}) => {
  const calls = { share: [], copy: [] };
  const nav = {};
  if (share) nav.share = async (data) => { calls.share.push(data); return share(data); };
  if (canShare) nav.canShare = canShare;
  if (clipboard) nav.clipboard = { writeText: async (text) => { calls.copy.push(text); return clipboard(text); } };
  return { nav, calls };
};

test("shareItem: usa la condivisione del telefono con titolo e link originale", async () => {
  const { nav, calls } = fakeNavigator({ share: () => undefined, clipboard: () => undefined });
  assert.equal(await shareItem(item(), { navigator: nav }), "shared");
  assert.deepEqual(calls.share, [{ title: "Incendio a Mesagne", url: "https://giornale.example/a" }]);
  assert.deepEqual(calls.copy, []);
});

test("shareItem: se l'utente annulla non è un errore e non copia nulla", async () => {
  const { nav, calls } = fakeNavigator({ share: () => { throw abort(); }, clipboard: () => undefined });
  assert.equal(await shareItem(item(), { navigator: nav }), "cancelled");
  assert.deepEqual(calls.copy, []);
});

test("shareItem: se share fallisce per altri motivi copia il link", async () => {
  const { nav, calls } = fakeNavigator({ share: () => { throw denied(); }, clipboard: () => undefined });
  assert.equal(await shareItem(item(), { navigator: nav }), "copied");
  assert.deepEqual(calls.copy, ["https://giornale.example/a"]);
});

test("shareItem: senza share copia il link negli appunti", async () => {
  const { nav, calls } = fakeNavigator({ clipboard: () => undefined });
  assert.equal(await shareItem(item(), { navigator: nav }), "copied");
  assert.deepEqual(calls.copy, ["https://giornale.example/a"]);
});

test("shareItem: senza share né appunti, o con appunti che falliscono, è 'unsupported'", async () => {
  assert.equal(await shareItem(item(), { navigator: {} }), "unsupported");
  assert.equal(await shareItem(item(), { navigator: undefined }), "unsupported");
  const { nav } = fakeNavigator({ clipboard: () => { throw denied(); } });
  assert.equal(await shareItem(item(), { navigator: nav }), "unsupported");
});

test("shareItem: un link che non è http(s) non viene mai condiviso né copiato", async () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "", null, undefined, "//evil.example"]) {
    const { nav, calls } = fakeNavigator({ share: () => undefined, clipboard: () => undefined });
    assert.equal(await shareItem(item({ url }), { navigator: nav }), "unsupported", String(url));
    assert.deepEqual([calls.share, calls.copy], [[], []]);
  }
  assert.equal(await shareItem(null, { navigator: {} }), "unsupported");
});

const px = (text) => text.length * 10;

test("layoutDigestLines: va a capo per parole e ogni riga entra nella larghezza", () => {
  const [lines] = layoutDigestLines([{ title: "uno due tre quattro cinque sei sette" }], 100, px);
  assert.deepEqual(lines, ["uno due", "tre", "quattro", "cinque sei", "sette"]);
  assert.ok(lines.every((line) => px(line) <= 100));
});

test("layoutDigestLines: una riga per titolo corto, una lista di righe per ogni notizia", () => {
  const out = layoutDigestLines([{ title: "breve" }, { title: "altro titolo" }], 400, px);
  assert.deepEqual(out, [["breve"], ["altro titolo"]]);
});

test("layoutDigestLines: una parola più larga della riga viene spezzata e non si perde nulla", () => {
  const word = "Superlungaparolaseguitadaaltrecaratteri";
  const [lines] = layoutDigestLines([{ title: `a ${word} b` }], 100, px);
  assert.ok(lines.every((line) => px(line) <= 100), JSON.stringify(lines));
  assert.equal(lines.join("").replace(/ /g, ""), `a${word}b`);
});

test("layoutDigestLines: larghezza minore di un carattere non va in ciclo infinito", () => {
  const [lines] = layoutDigestLines([{ title: "abc def" }], 5, px);
  assert.equal(lines.join("").replace(/ /g, ""), "abcdef");
});

test("layoutDigestLines: spazi multipli, titoli vuoti o mancanti", () => {
  assert.deepEqual(layoutDigestLines([{ title: "  a    b  " }], 400, px), [["a b"]]);
  assert.deepEqual(layoutDigestLines([{ title: "" }, { title: "   " }, {}, null], 400, px), [[], [], [], []]);
});

test("layoutDigestLines: con maxLines tronca l'ultima riga con i puntini e resta dentro la larghezza", () => {
  const title = "uno due tre quattro cinque sei sette otto nove dieci";
  const [lines] = layoutDigestLines([{ title }], 100, px, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"), lines[1]);
  assert.ok(lines.every((line) => px(line) <= 100), JSON.stringify(lines));
  const [short] = layoutDigestLines([{ title: "uno due" }], 100, px, 2);
  assert.deepEqual(short, ["uno due"]);
});

const blob = new Blob(["png"], { type: "image/png" });
const digestEnv = (over = {}) => {
  const downloads = [];
  const renders = [];
  return {
    downloads, renders,
    env: {
      renderCanvas: async (items, date) => { renders.push([items, date]); return blob; },
      download: (file, name) => downloads.push([file, name]),
      ...over,
    },
  };
};
const five = Array.from({ length: 5 }, (_, i) => item({ title: `Notizia ${i}`, source: `Fonte ${i}` }));
const DATE = new Date("2026-10-14T10:30:00Z");

test("shareDigest: condivide l'immagine come file PNG con il link dell'app nel testo", async () => {
  const { nav, calls } = fakeNavigator({ share: () => undefined, canShare: () => true });
  const { env, renders, downloads } = digestEnv({ navigator: nav });
  assert.equal(await shareDigest(five, { date: DATE, appUrl: "https://app.example/", env }), "shared");
  assert.equal(renders.length, 1);
  const [data] = calls.share;
  assert.equal(data.files.length, 1);
  assert.match(data.files[0].name, /^salento-oggi-\d{4}-\d{2}-\d{2}\.png$/);
  assert.equal(data.files[0].type, "image/png");
  assert.match(data.text, /https:\/\/app\.example\//);
  assert.deepEqual(downloads, []);
});

test("shareDigest: se l'utente annulla non scarica nulla", async () => {
  const { nav } = fakeNavigator({ share: () => { throw abort(); }, canShare: () => true });
  const { env, downloads } = digestEnv({ navigator: nav });
  assert.equal(await shareDigest(five, { date: DATE, env }), "cancelled");
  assert.deepEqual(downloads, []);
});

test("shareDigest: senza condivisione di file scarica l'immagine", async () => {
  for (const nav of [{}, undefined, fakeNavigator({ share: () => undefined, canShare: () => false }).nav, fakeNavigator({ share: () => undefined }).nav]) {
    const { env, downloads } = digestEnv({ navigator: nav });
    assert.equal(await shareDigest(five, { date: DATE, env }), "downloaded");
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0][0], blob);
    assert.match(downloads[0][1], /^salento-oggi-2026-10-14\.png$/);
  }
});

test("shareDigest: se share fallisce per altri motivi ripiega sul download", async () => {
  const { nav } = fakeNavigator({ share: () => { throw denied(); }, canShare: () => true });
  const { env, downloads } = digestEnv({ navigator: nav });
  assert.equal(await shareDigest(five, { date: DATE, env }), "downloaded");
  assert.equal(downloads.length, 1);
});

test("shareDigest: se l'immagine non si crea l'errore arriva a chi chiama; senza notizie non crea nulla", async () => {
  const { env } = digestEnv({ renderCanvas: async () => { throw new Error("canvas non disponibile"); } });
  await assert.rejects(shareDigest(five, { date: DATE, env }), /canvas non disponibile/);
  const empty = digestEnv();
  await assert.rejects(shareDigest([], { date: DATE, env: empty.env }));
  assert.deepEqual(empty.renders, []);
});
