import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import vm from "node:vm";

const ORIGIN = "https://app.example";
const SCOPE = `${ORIGIN}/salento-oggi/`;
const NEWS = `${SCOPE}data/news.json`;
const APP_DIR = new URL("../", import.meta.url);
const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const req = (url, { method = "GET", mode = "cors" } = {}) => ({ url, method, mode });
const urlOf = (input) => (typeof input === "string" ? input : input.url);
const keyOf = (input, ignoreSearch) => {
  const url = new URL(urlOf(input));
  if (ignoreSearch) url.search = "";
  return url.href;
};

class FakeCache {
  constructor(fetchFn) { this.map = new Map(); this.fetchFn = fetchFn; }
  async match(input, options = {}) {
    for (const [key, res] of this.map) if (keyOf(key, options.ignoreSearch) === keyOf(input, options.ignoreSearch)) return res.clone();
    return undefined;
  }
  async put(input, res) { this.map.set(urlOf(input), res); }
  async addAll(urls) {
    const responses = await Promise.all(urls.map((url) => this.fetchFn(url)));
    responses.forEach((res, i) => { if (!res.ok) throw new TypeError(`addAll: ${urls[i]} → ${res.status}`); });
    responses.forEach((res, i) => this.map.set(urls[i], res));
  }
}

/** Carica sw.js così com'è in un contesto isolato, con caches, fetch e clients finti. */
function loadSw({ network = () => new Response("rete", { status: 200 }) } = {}) {
  const handlers = {};
  const fetchLog = [];
  const stores = new Map();
  const fetchFn = async (input) => { fetchLog.push(urlOf(input)); return network(urlOf(input), input); };
  const messages = [];
  const clientList = [{ postMessage: (m) => messages.push(JSON.parse(JSON.stringify(m))) }];
  const state = { skipped: false, claimed: false };
  const self = {
    location: { origin: ORIGIN, href: `${SCOPE}sw.js` },
    registration: { scope: SCOPE },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: async () => { state.skipped = true; },
    clients: { claim: async () => { state.claimed = true; }, matchAll: async () => clientList },
  };
  const caches = {
    open: async (name) => { if (!stores.has(name)) stores.set(name, new FakeCache(fetchFn)); return stores.get(name); },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  vm.runInNewContext(source, { self, caches, fetch: fetchFn, URL, Response, Promise, console });

  const lifecycle = async (type) => {
    const waits = [];
    handlers[type]({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  const fetchEvent = async (request) => {
    const event = { request, waits: [], responded: false, response: undefined };
    event.respondWith = (p) => { event.responded = true; event.response = p; };
    event.waitUntil = (p) => event.waits.push(p);
    handlers.fetch(event);
    return event;
  };
  return { stores, fetchLog, messages, state, lifecycle, fetchEvent, handlers };
}

test("install: mette in cache la shell dell'app e subito attiva il nuovo worker", async () => {
  const sw = loadSw();
  await sw.lifecycle("install");
  const shell = [...sw.stores.get("salento-shell-dev").map.keys()];
  for (const file of ["", "index.html", "styles.css", "manifest.webmanifest", "js/main.js"]) {
    assert.ok(shell.includes(`${SCOPE}${file}`), `manca ${file || "./"}`);
  }
  assert.equal(sw.state.skipped, true);
});

test("install: la shell elenca ogni modulo js dell'app e solo file che esistono", async () => {
  const sw = loadSw();
  await sw.lifecycle("install");
  const shell = [...sw.stores.get("salento-shell-dev").map.keys()].map((url) => url.slice(SCOPE.length));
  for (const file of readdirSync(new URL("js/", APP_DIR)).filter((name) => name.endsWith(".js"))) {
    assert.ok(shell.includes(`js/${file}`), `js/${file} non è nella shell: offline l'app si romperebbe`);
  }
  for (const file of shell.filter(Boolean)) assert.ok(existsSync(new URL(file, APP_DIR)), `${file} non esiste`);
});

test("install: salva subito anche le ultime notizie, così la prima apertura senza rete le trova", async () => {
  const sw = loadSw({ network: (url) => new Response(url.endsWith("news.json") ? newsBody("prime") : "ok", { status: 200 }) });
  await sw.lifecycle("install");
  const cached = await sw.stores.get("salento-data").match(NEWS);
  assert.match(await cached.text(), /prime/);
});

test("install: se le notizie non si scaricano l'installazione riesce lo stesso", async () => {
  for (const network of [
    (url) => { if (url.endsWith("news.json")) throw new TypeError("offline"); return new Response("ok", { status: 200 }); },
    (url) => new Response("no", { status: url.endsWith("news.json") ? 500 : 200 }),
  ]) {
    const sw = loadSw({ network });
    await sw.lifecycle("install");
    assert.equal(sw.state.skipped, true);
    assert.equal(await sw.stores.get("salento-data").match(NEWS), undefined);
  }
});

test("install: se un file della shell non si scarica l'installazione fallisce (niente shell a metà)", async () => {
  const sw = loadSw({ network: (url) => new Response("no", { status: url.endsWith("styles.css") ? 404 : 200 }) });
  await assert.rejects(sw.lifecycle("install"));
});

test("activate: toglie le shell vecchie, tiene la shell attuale e le notizie, e prende il controllo", async () => {
  const sw = loadSw();
  await sw.lifecycle("install");
  sw.stores.set("salento-shell-vecchia", new FakeCache(() => {}));
  sw.stores.set("salento-data", new FakeCache(() => {}));
  sw.stores.set("altra-app", new FakeCache(() => {}));
  await sw.lifecycle("activate");
  assert.deepEqual([...sw.stores.keys()].sort(), ["altra-app", "salento-data", "salento-shell-dev"]);
  assert.equal(sw.state.claimed, true);
});

test("fetch: le richieste verso altri domini non vengono né gestite né salvate", async () => {
  const sw = loadSw();
  for (const url of ["https://giornale.example/foto.jpg", "https://www.corrieresalentino.it/feed/", `http://app.example/salento-oggi/data/news.json`]) {
    const event = await sw.fetchEvent(req(url));
    assert.equal(event.responded, false, url);
  }
  assert.deepEqual(sw.fetchLog, []);
  assert.deepEqual([...sw.stores.keys()], []);
});

test("fetch: le richieste che non sono GET non vengono gestite", async () => {
  const sw = loadSw();
  const event = await sw.fetchEvent(req(`${SCOPE}index.html`, { method: "POST" }));
  assert.equal(event.responded, false);
});

const newsBody = (stamp) => JSON.stringify({ updated_at: stamp, items: [] });

test("news.json: risponde subito con la copia salvata e intanto la aggiorna", async () => {
  const sw = loadSw({ network: () => new Response(newsBody("nuova"), { status: 200 }) });
  const cache = new FakeCache(() => {});
  await cache.put(NEWS, new Response(newsBody("vecchia"), { status: 200 }));
  sw.stores.set("salento-data", cache);

  const event = await sw.fetchEvent(req(NEWS));
  assert.equal(event.responded, true);
  assert.match(await (await event.response).text(), /vecchia/);
  await Promise.all(event.waits);
  assert.match(await (await cache.match(NEWS)).text(), /nuova/);
  assert.deepEqual(sw.messages, [{ type: "news-updated" }]);
});

test("news.json: la rete risponde dopo che la pagina ha già letto la copia salvata, e la copia si aggiorna lo stesso", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sw = loadSw({ network: async () => { await gate; return new Response(newsBody("nuova"), { status: 200 }); } });
  const cache = new FakeCache(() => {});
  await cache.put(NEWS, new Response(newsBody("vecchia"), { status: 200 }));
  sw.stores.set("salento-data", cache);

  const event = await sw.fetchEvent(req(NEWS));
  assert.match(await (await event.response).text(), /vecchia/); // la pagina consuma il corpo prima che la rete risponda
  release();
  await Promise.all(event.waits);
  assert.match(await (await cache.match(NEWS)).text(), /nuova/);
  assert.deepEqual(sw.messages, [{ type: "news-updated" }]);
});

test("news.json: se la copia aggiornata è identica non avvisa la pagina (niente cicli)", async () => {
  const sw = loadSw({ network: () => new Response(newsBody("uguale"), { status: 200 }) });
  const cache = new FakeCache(() => {});
  await cache.put(NEWS, new Response(newsBody("uguale"), { status: 200 }));
  sw.stores.set("salento-data", cache);
  const event = await sw.fetchEvent(req(NEWS));
  await event.response;
  await Promise.all(event.waits);
  assert.deepEqual(sw.messages, []);
});

test("news.json: la prima volta, senza copia, usa la rete e la salva senza avvisare nessuno", async () => {
  const sw = loadSw({ network: () => new Response(newsBody("prima"), { status: 200 }) });
  const event = await sw.fetchEvent(req(NEWS));
  assert.match(await (await event.response).text(), /prima/);
  await Promise.all(event.waits);
  assert.match(await (await sw.stores.get("salento-data").match(NEWS)).text(), /prima/);
  assert.deepEqual(sw.messages, []);
});

test("news.json: senza copia e senza rete la richiesta fallisce (l'app tiene i dati che ha)", async () => {
  const sw = loadSw({ network: () => { throw new TypeError("offline"); } });
  const event = await sw.fetchEvent(req(NEWS));
  await assert.rejects(event.response);
});

test("news.json: offline con copia salvata, la copia salvata resta disponibile", async () => {
  const sw = loadSw({ network: () => { throw new TypeError("offline"); } });
  const cache = new FakeCache(() => {});
  await cache.put(NEWS, new Response(newsBody("ultima"), { status: 200 }));
  sw.stores.set("salento-data", cache);
  const event = await sw.fetchEvent(req(NEWS));
  assert.match(await (await event.response).text(), /ultima/);
  await Promise.all(event.waits);
});

test("news.json: una risposta di errore del server non sostituisce la copia buona", async () => {
  const sw = loadSw({ network: () => new Response("guasto", { status: 500 }) });
  const cache = new FakeCache(() => {});
  await cache.put(NEWS, new Response(newsBody("buona"), { status: 200 }));
  sw.stores.set("salento-data", cache);
  const event = await sw.fetchEvent(req(NEWS));
  await event.response;
  await Promise.all(event.waits);
  assert.match(await (await cache.match(NEWS)).text(), /buona/);
  assert.deepEqual(sw.messages, []);
});

test("shell: prima la cache, senza toccare la rete", async () => {
  const sw = loadSw();
  await sw.lifecycle("install");
  sw.fetchLog.length = 0;
  const event = await sw.fetchEvent(req(`${SCOPE}styles.css`));
  assert.equal(event.responded, true);
  assert.equal((await event.response).status, 200);
  assert.deepEqual(sw.fetchLog, []);
});

test("shell: un file non ancora in cache si scarica e si salva; un errore 404 non si salva", async () => {
  const sw = loadSw({ network: (url) => new Response("x", { status: url.endsWith("non-c-e.png") ? 404 : 200 }) });
  await sw.lifecycle("install");
  const cache = sw.stores.get("salento-shell-dev");
  const ok = await sw.fetchEvent(req(`${SCOPE}icons/nuovo.png`));
  assert.equal((await ok.response).status, 200);
  assert.ok(await cache.match(`${SCOPE}icons/nuovo.png`));
  const missing = await sw.fetchEvent(req(`${SCOPE}icons/non-c-e.png`));
  assert.equal((await missing.response).status, 404);
  assert.equal(await cache.match(`${SCOPE}icons/non-c-e.png`), undefined);
});

test("shell: aprendo l'app senza rete si vede la pagina salvata, anche con parametri nell'indirizzo", async () => {
  const sw = loadSw();
  await sw.lifecycle("install");
  sw.fetchLog.length = 0;
  const navigation = await sw.fetchEvent(req(`${SCOPE}?utm_source=whatsapp`, { mode: "navigate" }));
  const res = await navigation.response;
  assert.equal(res.status, 200);
  assert.deepEqual(sw.fetchLog, []);
});

test("shell: una pagina qualsiasi aperta offline ripiega sulla pagina principale", async () => {
  let online = true;
  const sw = loadSw({ network: (url) => { if (!online && !url.endsWith("sw.js")) throw new TypeError("offline"); return new Response("ok", { status: 200 }); } });
  await sw.lifecycle("install");
  online = false;
  const event = await sw.fetchEvent(req(`${SCOPE}una/pagina`, { mode: "navigate" }));
  assert.equal((await event.response).status, 200);
  const asset = await sw.fetchEvent(req(`${SCOPE}icons/mancante.png`));
  await assert.rejects(asset.response);
});
