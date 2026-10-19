/** Collegamento al DOM: carica news.json, ridisegna le schermate, gestisce filtri, azioni e navigazione. */
import { parseNews } from "./data.js";
import { ALL_CATEGORIES, ALL_ZONES, filterItems, pickTopFive } from "./filters.js";
import { installMode, recordVisit, renderInstallBanner, shouldShowInstallPrompt } from "./install.js";
import { getDisabledSources, getSaved, toggleSaved, toggleSource } from "./prefs.js";
import { formatDateline, formatUpdated } from "./render.js";
import { shareDigest, shareItem } from "./share.js";
import { createStore, getBrowserStorage } from "./store.js";
import { renderDigest, renderSaved, renderSources, renderToday } from "./views.js";

const DEFAULT_SCREEN = "oggi";
const NEWS_URL = "data/news.json";
const REFRESH_AFTER_MS = 5 * 60 * 1000;
const FILTER_NAMES = new Set(["zone", "category"]);

const store = createStore(getBrowserStorage());
const state = { news: parseNews(null), zone: ALL_ZONES, category: ALL_CATEGORIES, loadedAt: 0, loading: false, reloadRequested: false };
const byId = (id) => document.getElementById(id);

const currentScreen = () => {
  const name = location.hash.slice(1);
  return document.querySelector(`[data-screen="${CSS.escape(name)}"]`) ? name : DEFAULT_SCREEN;
};

/** Sostituisce l'HTML mantenendo lo scorrimento orizzontale dei filtri e il focus sul pulsante attivo. */
function replaceFilters(html) {
  const el = byId("filters");
  if (el.innerHTML === html) return;
  const scroll = [...el.querySelectorAll(".chips")].map((chips) => chips.scrollLeft);
  const focused = el.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = focused ? [focused.dataset.filter, focused.dataset.value] : null;
  el.innerHTML = html;
  el.querySelectorAll(".chips").forEach((chips, index) => { chips.scrollLeft = scroll[index] ?? 0; });
  if (focusKey) {
    const same = [...el.querySelectorAll(".chip")].find((chip) => chip.dataset.filter === focusKey[0] && chip.dataset.value === focusKey[1]);
    same?.focus({ preventScroll: true });
  }
}

function render() {
  const now = new Date();
  const disabledSources = getDisabledSources(store);
  const saved = getSaved(store);

  byId("dateline").textContent = formatDateline(now);
  byId("updated").textContent = formatUpdated(state.news.updatedAt, now);

  const today = renderToday({
    items: state.news.items, zone: state.zone, category: state.category,
    disabledSources, savedIds: saved.map((item) => item.id), now,
  });
  replaceFilters(today.filters);
  byId("feed").innerHTML = today.feed;
  byId("digest").innerHTML = renderDigest({ items: state.news.items, disabledSources, now });
  byId("saved").innerHTML = renderSaved({ saved, now });
  byId("sources").innerHTML = renderSources({ sources: state.news.sources, disabledSources });

  const screen = currentScreen();
  document.querySelectorAll("[data-screen]").forEach((section) => { section.hidden = section.dataset.screen !== screen; });
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    if (tab.dataset.tab === screen) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
}

/** Se il caricamento fallisce restano le ultime notizie già mostrate. */
async function load() {
  if (state.loading) {
    state.reloadRequested = true; // es. il service worker segnala notizie nuove mentre stiamo ancora leggendo
    return;
  }
  state.loading = true;
  try {
    const response = await fetch(NEWS_URL, { cache: "no-cache" });
    if (response.ok) {
      state.news = parseNews(await response.json());
      state.loadedAt = Date.now();
    }
  } catch {
    /* rete assente o JSON non valido: si tengono i dati attuali */
  } finally {
    state.loading = false;
    render();
    if (state.reloadRequested) {
      state.reloadRequested = false;
      load();
    }
  }
}

/** Cerca anche tra i preferiti perché una notizia salvata potrebbe non essere più in news.json. */
const findItem = (id) => state.news.items.find((entry) => entry.id === id) ?? getSaved(store).find((entry) => entry.id === id);

let toastTimer;
function notify(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

const SHARE_MESSAGES = {
  copied: "Link copiato",
  downloaded: "Immagine scaricata",
  unsupported: "Condivisione non disponibile su questo dispositivo",
};

async function shareOne(id) {
  const item = findItem(id);
  if (!item) return;
  const message = SHARE_MESSAGES[await shareItem(item)];
  if (message) notify(message);
}

async function shareToday() {
  const items = pickTopFive(filterItems(state.news.items, { disabledSources: getDisabledSources(store) }));
  try {
    const message = SHARE_MESSAGES[await shareDigest(items)];
    if (message) notify(message);
  } catch {
    notify("Non sono riuscito a creare l'immagine");
  }
}

/** Salva o rimuove una notizia. */
function saveItem(id) {
  const item = findItem(id);
  if (!item) return;
  toggleSaved(store, item);
  render();
  document.querySelector(`[data-screen]:not([hidden]) [data-action="save"][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
}

/* Invito all'installazione: dopo la terza visita, una sola volta. */
const visits = recordVisit(store);
let installEvent = null;
let installVisible = false;

function hideInstall() {
  byId("install").innerHTML = "";
  installVisible = false;
}

function showInstall() {
  if (installVisible || !shouldShowInstallPrompt(visits, store.get("installShown", false))) return;
  const mode = installMode({
    standalone: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
    hasPrompt: installEvent !== null,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  if (mode === "none") return;
  byId("install").innerHTML = renderInstallBanner(mode);
  installVisible = true;
  store.set("installShown", true);
}

async function installApp() {
  const prompt = installEvent;
  installEvent = null;
  hideInstall();
  if (!prompt) return;
  prompt.prompt();
  await prompt.userChoice.catch(() => {});
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installEvent = event;
  showInstall();
});
window.addEventListener("appinstalled", hideInstall);

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-filter], [data-action]") : null;
  if (!target) return;
  const { filter, value, action } = target.dataset;
  if (filter) {
    if (FILTER_NAMES.has(filter)) {
      state[filter] = value;
      render();
    }
    return;
  }
  if (action === "retry") load();
  else if (action === "reset-filters") {
    state.zone = ALL_ZONES;
    state.category = ALL_CATEGORIES;
    render();
  } else if (action === "go-sources") location.hash = "#fonti";
  else if (action === "save") saveItem(target.dataset.id);
  else if (action === "share") shareOne(target.dataset.id);
  else if (action === "share-digest") shareToday();
  else if (action === "install") installApp();
  else if (action === "dismiss-install") hideInstall();
});

document.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.classList.contains("switch")) return;
  const { source } = input.dataset;
  toggleSource(store, source);
  render();
  document.querySelector(`.switch[data-source="${CSS.escape(source)}"]`)?.focus({ preventScroll: true });
});

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - state.loadedAt > REFRESH_AFTER_MS) load();
  else render();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  // Il service worker risponde subito con la copia salvata e poi aggiorna: se è cambiata, rileggiamo.
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "news-updated") load();
  });
}

render();
showInstall();
load();
