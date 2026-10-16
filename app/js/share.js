/** Condivisione: singola notizia (solo link originale) e scheda immagine "Il Salento in 5 notizie". */
import { formatDateline } from "./render.js";

const TIME_ZONE = "Europe/Rome";
const CANVAS = { width: 1080, height: 1350, margin: 72 };
const COLORS = { bg: "#f5f6f2", ink: "#1c211d", muted: "#5a625b", line: "#dcded5", accent: "#b8472a", onAccent: "#ffffff" };
const TITLE_FIRST_BASELINE = 66;
const TITLE_LINE_HEIGHT = 50;
const SOURCE_GAP = 40;
const ROW_PADDING = 24;
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

const isHttpUrl = (value) => {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const resolveNavigator = (options) => ("navigator" in options ? options.navigator : globalThis.navigator);
const isCancel = (error) => error?.name === "AbortError";

/**
 * Condivide titolo e link originale con la condivisione nativa; se non c'è, copia il link.
 * @returns {Promise<"shared" | "cancelled" | "copied" | "unsupported">}
 */
export async function shareItem(item, options = {}) {
  const url = item?.url;
  if (!isHttpUrl(url)) return "unsupported";
  const nav = resolveNavigator(options);
  if (typeof nav?.share === "function") {
    try {
      await nav.share({ title: String(item.title ?? ""), url });
      return "shared";
    } catch (error) {
      if (isCancel(error)) return "cancelled";
    }
  }
  try {
    await nav.clipboard.writeText(url);
    return "copied";
  } catch {
    return "unsupported";
  }
}

/** Divide una parola più larga della riga in pezzi che entrano, almeno un carattere per pezzo. */
function splitWord(word, maxWidth, measure) {
  const chunks = [];
  let chunk = "";
  for (const char of word) {
    if (chunk && measure(chunk + char) > maxWidth) {
      chunks.push(chunk);
      chunk = char;
    } else {
      chunk += char;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapTitle(title, maxWidth, measure) {
  const lines = [];
  let current = "";
  for (const word of String(title ?? "").split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (measure(word) <= maxWidth) {
      current = word;
    } else {
      const chunks = splitWord(word, maxWidth, measure);
      current = chunks.pop();
      lines.push(...chunks);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncateLine(line, maxWidth, measure) {
  let text = line;
  while (text && measure(`${text}…`) > maxWidth) text = text.slice(0, -1).trimEnd();
  return `${text}…`;
}

/**
 * Spezza i titoli in righe che entrano in maxWidth. Con maxLines l'ultima riga si chiude con "…".
 * @returns {string[][]} una lista di righe per ogni notizia
 */
export function layoutDigestLines(items, maxWidth, measure, maxLines = Infinity) {
  return items.map((item) => {
    const lines = wrapTitle(item?.title, maxWidth, measure);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = truncateLine(kept[maxLines - 1], maxWidth, measure);
    return kept;
  });
}

const fileDate = (date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIME_ZONE }).format(date);

/**
 * Crea la scheda del riepilogo e la condivide come immagine; se il telefono non condivide file, la scarica.
 * Se l'immagine non si può creare l'errore arriva a chi chiama.
 * @returns {Promise<"shared" | "cancelled" | "downloaded">}
 */
export async function shareDigest(items, { date = new Date(), appUrl = appAddress(), env = {} } = {}) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Nessuna notizia da condividere");
  const nav = "navigator" in env ? env.navigator : globalThis.navigator;
  const renderCanvas = env.renderCanvas ?? renderDigestCanvas;
  const download = env.download ?? downloadBlob;

  const blob = await renderCanvas(items, date, { appUrl });
  const name = `salento-oggi-${fileDate(date)}.png`;
  const file = new File([blob], name, { type: "image/png" });
  const data = { files: [file], title: "Il Salento in 5 notizie", text: appUrl ? `Il Salento in 5 notizie · ${appUrl}` : "Il Salento in 5 notizie" };

  if (typeof nav?.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
    try {
      await nav.share(data);
      return "shared";
    } catch (error) {
      if (isCancel(error)) return "cancelled";
    }
  }
  download(blob, name);
  return "downloaded";
}

function appAddress() {
  const { location } = globalThis;
  return location ? `${location.origin}${location.pathname}` : "";
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Disegna la scheda 1080×1350: data, le notizie con fonte e l'indirizzo dell'app. Solo browser. */
export async function renderDigestCanvas(items, date = new Date(), { appUrl = appAddress() } = {}) {
  const { width, height, margin } = CANVAS;
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  await document.fonts?.ready;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, width, 12);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.accent;
  ctx.font = `700 30px ${SANS}`;
  ctx.fillText("SALENTO OGGI", margin, 100);
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 68px ${SERIF}`;
  ctx.fillText(`Il Salento in ${items.length === 1 ? "1 notizia" : `${items.length} notizie`}`, margin, 184);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 32px ${SANS}`;
  ctx.fillText(formatDateline(date, TIME_ZONE), margin, 238);

  const numberWidth = 84;
  const textWidth = width - margin * 2 - numberWidth;
  const top = 290;
  const footer = 1230;
  const rowHeight = (footer - top) / items.length;
  // Titolo e fonte devono restare dentro la propria riga: il numero di righe del titolo dipende dallo spazio.
  const maxTitleLines = Math.min(3, Math.max(1, Math.floor((rowHeight - TITLE_FIRST_BASELINE - SOURCE_GAP - ROW_PADDING) / TITLE_LINE_HEIGHT) + 1));
  ctx.font = `650 40px ${SERIF}`;
  const measure = (text) => ctx.measureText(text).width;
  const titleLines = layoutDigestLines(items, textWidth, measure, maxTitleLines);
  items.forEach((item, index) => {
    const y = top + index * rowHeight;
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(margin, y, width - margin * 2, 2);
    ctx.fillStyle = COLORS.accent;
    ctx.font = `700 64px ${SERIF}`;
    ctx.fillText(String(index + 1), margin, y + 80);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `650 40px ${SERIF}`;
    const lines = titleLines[index];
    lines.forEach((line, lineIndex) => ctx.fillText(line, margin + numberWidth, y + TITLE_FIRST_BASELINE + lineIndex * TITLE_LINE_HEIGHT));
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 28px ${SANS}`;
    const sourceLimit = textWidth;
    const source = String(item?.source ?? "");
    let label = source;
    while (label && ctx.measureText(label).width > sourceLimit) label = label.slice(0, -1);
    ctx.fillText(label, margin + numberWidth, y + TITLE_FIRST_BASELINE + (lines.length - 1) * TITLE_LINE_HEIGHT + SOURCE_GAP);
  });

  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, height - 96, width, 96);
  ctx.fillStyle = COLORS.onAccent;
  ctx.font = `600 32px ${SANS}`;
  ctx.fillText(appUrl ? appUrl.replace(/^https?:\/\//, "") : "Salento Oggi", margin, height - 38);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Immagine non creata"))), "image/png");
  });
}
