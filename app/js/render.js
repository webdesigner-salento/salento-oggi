/** Funzioni pure che producono HTML (stringhe). Ogni testo dei giornali passa da escapeHtml. */
import { timeAgo } from "./filters.js";

const ICON_ATTRS = 'viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const ICON_BOOKMARK = `<svg ${ICON_ATTRS}><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1z"/></svg>`;
const ICON_SHARE = `<svg ${ICON_ATTRS}><path d="M12 15V3.5M8 7l4-3.5L16 7M5 11.5v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/></svg>`;
const LOCALE = "it-IT";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Restituisce il valore solo se è un indirizzo http(s); altrimenti null (mai javascript:, data:…). */
function safeHttpUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** Tonalità mediterranee (terracotta, ocra, ulivo, mare…), distanti almeno 30° l'una dall'altra. */
const SOURCE_HUES = [12, 45, 80, 150, 195, 340];

const hueFor = (name) => {
  let hash = 2166136261; // FNV-1a: stabile e ben distribuito anche su nomi simili
  for (const char of name) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  return SOURCE_HUES[hash % SOURCE_HUES.length];
};

/** Blocco al posto dell'immagine: colore stabile per fonte, nome della fonte in evidenza. */
export function renderPlaceholder(source) {
  const name = typeof source === "string" && source.trim() ? source.trim() : "Salento";
  return `<div class="ph" style="--h:${hueFor(name)}" aria-hidden="true"><span class="ph-name">${escapeHtml(name)}</span></div>`;
}

export function renderCard(item, { saved = false, now = new Date(), lead = false } = {}) {
  const imageUrl = safeHttpUrl(item.image);
  const media = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="" decoding="async" referrerpolicy="no-referrer" ${
        lead ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'
      }>`
    : renderPlaceholder(item.source);
  const body = `<div class="media" data-source="${escapeHtml(item.source)}">${media}</div>` +
    `<h3 class="card-title">${escapeHtml(item.title)}</h3>`;
  const link = safeHttpUrl(item.url);
  const wrapped = link
    ? `<a class="card-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">${body}</a>`
    : `<div class="card-link">${body}</div>`;
  const when = timeAgo(item.published_at, now);
  const id = escapeHtml(item.id);
  return `<article class="card${lead ? " card--lead" : ""}" data-id="${id}">` +
    `<div class="card-main">${wrapped}${lead && item.summary ? `<p class="card-summary">${escapeHtml(item.summary)}</p>` : ""}` +
    `<div class="card-meta"><span class="source">${escapeHtml(item.source)}</span>` +
    (when ? `<time datetime="${escapeHtml(item.published_at)}">${escapeHtml(when)}</time>` : "") +
    `<span class="card-actions">` +
    `<button type="button" class="icon-btn${saved ? " is-saved" : ""}" data-action="save" data-id="${id}" aria-pressed="${saved}" aria-label="${saved ? "Rimuovi dai preferiti" : "Salva nei preferiti"}">${ICON_BOOKMARK}</button>` +
    `<button type="button" class="icon-btn" data-action="share" data-id="${id}" aria-label="Condividi">${ICON_SHARE}</button>` +
    `</span></div></div></article>`;
}

/** Riga della schermata "Il Salento in 5 notizie": solo titolo e fonte, senza immagine. */
export function renderDigestRow(item, { now = new Date() } = {}) {
  const when = timeAgo(item.published_at, now);
  const inner = `<h3 class="digest-row-title">${escapeHtml(item.title)}</h3>` +
    `<p class="digest-row-meta"><span class="source">${escapeHtml(item.source)}</span>` +
    (when ? `<time datetime="${escapeHtml(item.published_at)}">${escapeHtml(when)}</time>` : "") + `</p>`;
  const link = safeHttpUrl(item.url);
  return `<li class="digest-row">${
    link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener">${inner}</a>` : `<div>${inner}</div>`
  }</li>`;
}

/** Gruppo di pulsanti-filtro; `selected` è il valore attivo. */
export function renderChips({ name, options, selected, label = "" }) {
  const buttons = options
    .map(({ value, label: text }) =>
      `<button type="button" class="chip" data-filter="${escapeHtml(name)}" data-value="${escapeHtml(value)}" aria-pressed="${value === selected}">${escapeHtml(text)}</button>`)
    .join("");
  return `<div class="chips chips--${escapeHtml(name)}" role="group"${label ? ` aria-label="${escapeHtml(label)}"` : ""}>${buttons}</div>`;
}

export function renderEmpty({ title, text, action }) {
  return `<div class="empty"><h2 class="empty-title">${escapeHtml(title)}</h2><p class="empty-text">${escapeHtml(text)}</p>` +
    (action ? `<button type="button" class="btn" data-action="${escapeHtml(action.action)}">${escapeHtml(action.label)}</button>` : "") +
    `</div>`;
}

export function renderSourceRow(status, { enabled = true, timeZone } = {}) {
  const clock = formatClock(status.last_ok, timeZone);
  const state = status.ok
    ? `Aggiornata${clock ? ` alle ${clock}` : ""}`
    : `Non risponde${clock ? `, ultime notizie alle ${clock}` : ""}`;
  const name = escapeHtml(status.source);
  return `<li class="source-row"><label><span class="source-text"><span class="source-name">${name}</span>` +
    `<span class="source-state">${escapeHtml(state)}</span></span>` +
    `<input type="checkbox" class="switch" role="switch" data-source="${name}"${enabled ? " checked" : ""}></label></li>`;
}

const parseDate = (iso) => {
  const date = new Date(iso);
  return typeof iso === "string" && iso && !Number.isNaN(date.getTime()) ? date : null;
};

export function formatDateline(now = new Date(), timeZone) {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone }).format(now);
}

export function formatClock(iso, timeZone) {
  const date = parseDate(iso);
  if (!date) return "";
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(date);
}

export function formatUpdated(iso, now = new Date(), timeZone) {
  const date = parseDate(iso);
  if (!date) return "Non ancora aggiornato";
  const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(d);
  const clock = formatClock(iso, timeZone);
  if (dayKey(date) === dayKey(now)) return `Aggiornato alle ${clock}`;
  const day = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", timeZone }).format(date);
  return `Aggiornato il ${day} alle ${clock}`;
}
