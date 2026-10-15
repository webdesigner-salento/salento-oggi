/**
 * Filtri, selezione "5 notizie" e tempo relativo. Nessuna dipendenza dal DOM.
 * @typedef {{id:string,title:string,summary:string,image:string|null,url:string,source:string,
 *   category:string,zone:string,published_at:string}} Item
 */

export const ALL_ZONES = "Tutto";
export const ALL_CATEGORIES = "Tutte";
const GENERIC_ZONE = "Salento";
const TOP_COUNT = 5;

const toTime = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
};
/** Comparatore per `sort`: dalla più recente; date mancanti o non valide in fondo. */
export const newestFirst = (a, b) => {
  const ta = toTime(a.published_at);
  const tb = toTime(b.published_at);
  return ta === tb ? 0 : tb > ta ? 1 : -1;
};

/** @returns {Item[]} una nuova lista; non modifica l'input. */
export function filterItems(items, { zone = ALL_ZONES, category = ALL_CATEGORIES, disabledSources = [] } = {}) {
  const off = new Set(disabledSources);
  return items.filter(
    (item) =>
      !off.has(item.source) &&
      (zone === ALL_ZONES || item.zone === zone || item.zone === GENERIC_ZONE) &&
      (category === ALL_CATEGORIES || item.category === category),
  );
}

/** Le 5 più recenti con fonti diverse; se le fonti sono meno di 5, completa con le più recenti restanti. */
export function pickTopFive(items) {
  const sorted = [...items].sort(newestFirst);
  const chosen = [];
  const sources = new Set();
  for (const item of sorted) {
    if (chosen.length === TOP_COUNT) break;
    if (!sources.has(item.source)) {
      sources.add(item.source);
      chosen.push(item);
    }
  }
  for (const item of sorted) {
    if (chosen.length === TOP_COUNT) break;
    if (!chosen.includes(item)) chosen.push(item);
  }
  return chosen.sort(newestFirst);
}

/** "adesso", "12 min fa", "3 h fa", "ieri", "2 g fa"; stringa vuota se la data non è valida. */
export function timeAgo(iso, now = new Date()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const seconds = Math.floor((now.getTime() - t) / 1000);
  if (seconds < 60) return "adesso";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h fa`;
  const days = Math.floor(hours / 24);
  return days < 2 ? "ieri" : `${days} g fa`;
}
