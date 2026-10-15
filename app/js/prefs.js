/**
 * Preferenze dell'utente salvate sul telefono: notizie salvate e fonti disattivate.
 * Tutto ciò che si legge dall'archivio è trattato come non fidato: i dati corrotti si scartano.
 */
import { parseItem } from "./data.js";

const SAVED_KEY = "saved";
const DISABLED_SOURCES_KEY = "disabledSources";

const isName = (value) => typeof value === "string" && value.trim() !== "";

/** @returns {object[]} notizie salvate, l'ultima salvata per prima, senza doppioni. */
export function getSaved(store) {
  const raw = store.get(SAVED_KEY, []);
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const saved = [];
  for (const entry of raw) {
    const item = parseItem(entry);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      saved.push(item);
    }
  }
  return saved;
}

/**
 * Salva (con una copia completa della scheda, che resta anche quando esce da news.json) o rimuove.
 * @returns {boolean} true se la notizia ora è tra i preferiti.
 */
export function toggleSaved(store, item) {
  const copy = parseItem(item);
  if (!copy) return false;
  const saved = getSaved(store);
  if (saved.some((entry) => entry.id === copy.id)) {
    store.set(SAVED_KEY, saved.filter((entry) => entry.id !== copy.id));
    return false;
  }
  store.set(SAVED_KEY, [copy, ...saved]);
  return true;
}

/** @returns {string[]} nomi delle fonti disattivate. */
export function getDisabledSources(store) {
  const raw = store.get(DISABLED_SOURCES_KEY, []);
  return Array.isArray(raw) ? [...new Set(raw.filter(isName))] : [];
}

/** @returns {string[]} l'elenco aggiornato delle fonti disattivate. */
export function toggleSource(store, name) {
  const current = getDisabledSources(store);
  if (!isName(name)) return current;
  const next = current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name];
  store.set(DISABLED_SOURCES_KEY, next);
  return next;
}
