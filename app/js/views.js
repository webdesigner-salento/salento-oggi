/** Le quattro schermate come funzioni pure: dati in ingresso, HTML in uscita. Nessun accesso al DOM. */
import { ALL_CATEGORIES, ALL_ZONES, filterItems, newestFirst, pickTopFive } from "./filters.js";
import {
  renderCard, renderChips, renderDigestRow, renderEmpty, renderSourceRow,
} from "./render.js";

export const ZONE_OPTIONS = [
  { value: ALL_ZONES, label: "Tutto il Salento" },
  { value: "Lecce", label: "Lecce" },
  { value: "Brindisi", label: "Brindisi" },
  { value: "Taranto", label: "Taranto" },
];

export const CATEGORY_OPTIONS = [
  { value: ALL_CATEGORIES, label: "Tutte" },
  ...["Cronaca", "Politica", "Sport", "Eventi", "Cultura", "Economia", "Salute", "Altro"].map((value) => ({ value, label: value })),
];

const EMPTY = {
  noNews: {
    title: "Nessuna notizia al momento",
    text: "Le notizie si aggiornano ogni 30 minuti. Riprova tra poco.",
    action: { label: "Riprova", action: "retry" },
  },
  noMatch: {
    title: "Nessuna notizia con questi filtri",
    text: "Prova un'altra zona o un'altra categoria.",
    action: { label: "Mostra tutto", action: "reset-filters" },
  },
  allSourcesOff: {
    title: "Tutte le fonti sono disattivate",
    text: "Attiva almeno una fonte per vedere le notizie.",
    action: { label: "Vai alle fonti", action: "go-sources" },
  },
};

/** @returns {{filters: string, feed: string}} filtri e lista separati, così i filtri non si ridisegnano a ogni tocco. */
export function renderToday({ items = [], zone = ALL_ZONES, category = ALL_CATEGORIES, disabledSources = [], savedIds = [], now = new Date() } = {}) {
  const filters =
    renderChips({ name: "zone", options: ZONE_OPTIONS, selected: zone, label: "Zona" }) +
    renderChips({ name: "category", options: CATEGORY_OPTIONS, selected: category, label: "Categoria" });

  const off = new Set(disabledSources);
  const visible = filterItems(items, { zone, category, disabledSources }).sort(newestFirst);
  if (visible.length === 0) {
    const empty = items.length === 0 ? EMPTY.noNews : items.every((item) => off.has(item.source)) ? EMPTY.allSourcesOff : EMPTY.noMatch;
    return { filters, feed: renderEmpty(empty) };
  }
  const saved = new Set(savedIds);
  const feed = visible
    .map((item, index) => renderCard(item, { saved: saved.has(item.id), now, lead: index === 0 }))
    .join("");
  return { filters, feed };
}

export function renderSaved({ saved = [], now = new Date() } = {}) {
  if (saved.length === 0) {
    return renderEmpty({ title: "Nessun preferito", text: "Tocca il segnalibro su una notizia per ritrovarla qui." });
  }
  return saved.map((item) => renderCard(item, { saved: true, now })).join("");
}

export function renderSources({ sources = [], disabledSources = [], timeZone } = {}) {
  if (sources.length === 0) {
    return renderEmpty({ title: "Nessuna fonte disponibile", text: "Le fonti compaiono dopo il primo aggiornamento." });
  }
  const off = new Set(disabledSources);
  const rows = sources.map((status) => renderSourceRow(status, { enabled: !off.has(status.source), timeZone })).join("");
  return `<ul class="sources">${rows}</ul>`;
}

export function renderDigest({ items = [], disabledSources = [], now = new Date() } = {}) {
  const picked = pickTopFive(filterItems(items, { disabledSources }));
  if (picked.length === 0) {
    return renderEmpty({ title: "Nessuna notizia per oggi", text: "Torna tra poco: il riepilogo si compone da solo." });
  }
  return `<ol class="digest">${picked.map((item) => renderDigestRow(item, { now })).join("")}</ol>`;
}
