/* Service worker di Salento Oggi: l'app si apre subito e senza rete mostra le ultime notizie viste.
 * - app (pagina, stili, moduli): prima la cache, la rete solo se manca; si rinnova a ogni pubblicazione.
 * - data/news.json: risponde subito con la copia salvata e intanto la aggiorna (stale-while-revalidate).
 * - qualsiasi altro dominio (giornali, immagini): non viene gestito né salvato. */

const BUILD = "dev"; // sostituito al deploy da scripts/stamp.py
const SHELL_CACHE = `salento-shell-${BUILD}`;
const DATA_CACHE = "salento-data";

const SHELL_FILES = [
  "", "index.html", "styles.css", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
  "js/data.js", "js/filters.js", "js/install.js", "js/main.js", "js/prefs.js",
  "js/render.js", "js/share.js", "js/store.js", "js/views.js",
];
const SHELL_URLS = SHELL_FILES.map((file) => new URL(file, self.registration.scope).href);

const isNews = (url) => url.pathname.endsWith("/data/news.json");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(saveLatestNews)
      .then(() => self.skipWaiting()),
  );
});

/** Salva subito le ultime notizie, così anche la prima apertura senza rete ha qualcosa da mostrare.
 *  Se non si scaricano l'installazione riesce lo stesso: la prima volta online le prenderà la pagina. */
async function saveLatestNews() {
  try {
    const url = new URL("data/news.json", self.registration.scope).href;
    const cache = await caches.open(DATA_CACHE);
    const response = await fetch(url);
    if (response.ok) await cache.put(url, response);
  } catch {
    /* nessuna copia salvata: l'app si apre lo stesso */
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith("salento-shell-") && name !== SHELL_CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(isNews(url) ? newsResponse(event, request) : shellResponse(request));
});

async function newsResponse(event, request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  // La pagina leggerà `cached` prima che la rete risponda: il confronto usa una copia fatta subito.
  const reference = cached?.clone();
  const refresh = fetch(request).then(async (response) => {
    if (!response.ok) return response;
    const changed = !reference || (await reference.text()) !== (await response.clone().text());
    await cache.put(request, response.clone());
    // La pagina ha ricevuto la copia vecchia: se è cambiato qualcosa le diciamo di rileggere.
    if (cached && changed) await notifyClients({ type: "news-updated" });
    return response;
  });
  if (!cached) return refresh;
  event.waitUntil(refresh.catch(() => {}));
  return cached;
}

async function shellResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  const navigation = request.mode === "navigate";
  const hit = await cache.match(request, { ignoreSearch: navigation });
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (navigation) {
      const home = await cache.match(new URL("index.html", self.registration.scope).href);
      if (home) return home;
    }
    throw error;
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => client.postMessage(message));
}
