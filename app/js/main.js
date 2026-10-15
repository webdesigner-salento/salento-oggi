/** Collegamento al DOM: carica news.json, ridisegna le schermate, gestisce filtri, azioni e navigazione. */
import { parseNews } from "./data.js";
import { ALL_CATEGORIES, ALL_ZONES } from "./filters.js";
import { formatDateline, formatUpdated } from "./render.js";
import { createStore, getBrowserStorage } from "./store.js";
import { renderDigest, renderSaved, renderSources, renderToday } from "./views.js";

const DEFAULT_SCREEN = "oggi";
const NEWS_URL = "data/news.json";
const REFRESH_AFTER_MS = 5 * 60 * 1000;
const FILTER_NAMES = new Set(["zone", "category"]);

const store = createStore(getBrowserStorage());
const state = { news: parseNews(null), zone: ALL_ZONES, category: ALL_CATEGORIES, loadedAt: 0, loading: false };
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
  const disabledSources = store.get("disabledSources", []);
  const saved = store.get("saved", []);

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
  if (state.loading) return;
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
  }
}

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

render();
load();
