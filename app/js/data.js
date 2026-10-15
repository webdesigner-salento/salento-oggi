/** Lettura difensiva di news.json: assente, vuoto o corrotto non deve mai rompere l'app. */

const isText = (value) => typeof value === "string" && value.length > 0;
const text = (value, fallback) => (isText(value) ? value : fallback);

function toItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!["id", "title", "url", "source"].every((key) => isText(raw[key]))) return null;
  return {
    id: raw.id,
    title: raw.title,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    image: isText(raw.image) ? raw.image : null,
    url: raw.url,
    source: raw.source,
    category: text(raw.category, "Altro"),
    zone: text(raw.zone, "Salento"),
    published_at: typeof raw.published_at === "string" ? raw.published_at : "",
  };
}

function toSource(raw) {
  if (!raw || typeof raw !== "object" || !isText(raw.source)) return null;
  return { source: raw.source, ok: raw.ok === true, last_ok: isText(raw.last_ok) ? raw.last_ok : null };
}

/** @returns {{updatedAt: string|null, items: object[], sources: object[]}} */
export function parseNews(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { updatedAt: null, items: [], sources: [] };
  return {
    updatedAt: text(raw.updated_at, null),
    items: Array.isArray(raw.items) ? raw.items.map(toItem).filter(Boolean) : [],
    sources: Array.isArray(raw.sources_status) ? raw.sources_status.map(toSource).filter(Boolean) : [],
  };
}
