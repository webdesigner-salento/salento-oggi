/**
 * Archivio chiave/valore sicuro: usa localStorage quando funziona, altrimenti la memoria.
 * Il valore scritto in sessione resta sempre leggibile, anche se la persistenza fallisce.
 */

/** @param {{getItem:Function,setItem:Function}|null} storage */
export function createStore(storage) {
  const memory = new Map();
  return {
    get(key, fallback = null) {
      let raw;
      if (memory.has(key)) {
        raw = memory.get(key);
      } else {
        try {
          raw = storage ? storage.getItem(key) : null;
        } catch {
          raw = null;
        }
      }
      if (raw === null || raw === undefined) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    /** @returns {boolean} true se il valore è stato anche salvato in modo persistente. */
    set(key, value) {
      const raw = JSON.stringify(value ?? null);
      memory.set(key, raw);
      try {
        if (!storage) return false;
        storage.setItem(key, raw);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** localStorage se disponibile e scrivibile (navigazione privata, cookie bloccati…), altrimenti null. */
export function getBrowserStorage(scope = globalThis) {
  try {
    const storage = scope.localStorage;
    if (!storage) return null;
    storage.setItem("__salento_probe__", "1");
    storage.removeItem("__salento_probe__");
    return storage;
  } catch {
    return null;
  }
}
