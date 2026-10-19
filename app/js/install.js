/** Invito a mettere l'app nella schermata Home: dopo la terza visita, una volta sola, senza popup. */

export const INSTALL_AFTER_VISITS = 3;

/** Mai prima della terza visita; se in quel momento non era possibile, alla prima occasione utile; una volta sola. */
export function shouldShowInstallPrompt(visits, alreadyShown) {
  return Number.isInteger(visits) && visits >= INSTALL_AFTER_VISITS && alreadyShown !== true;
}

const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Conta i giorni diversi in cui l'app è stata aperta, non le singole aperture. */
export function recordVisit(store, now = new Date()) {
  const today = dayKey(now);
  const stored = store.get("visits", 0);
  const visits = Number.isInteger(stored) && stored >= 0 ? stored : 0;
  if (store.get("lastVisitDay", null) === today && visits > 0) return visits;
  store.set("visits", visits + 1);
  store.set("lastVisitDay", today);
  return visits + 1;
}

/**
 * "none": niente da proporre · "prompt": il browser permette l'installazione con un tocco ·
 * "ios": su iPhone e iPad si spiega come aggiungere l'app alla Home.
 */
export function installMode({ standalone = false, hasPrompt = false, userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  if (standalone) return "none";
  if (hasPrompt) return "prompt";
  const iPhoneOrIPad = /iPhone|iPad|iPod/.test(userAgent);
  const iPadAsMac = platform === "MacIntel" && maxTouchPoints > 1;
  return iPhoneOrIPad || iPadAsMac ? "ios" : "none";
}

const CLOSE = `<button type="button" class="install-close" data-action="dismiss-install">Non ora</button>`;

export function renderInstallBanner(mode) {
  if (mode === "prompt") {
    return `<div class="install-banner"><p class="install-text"><strong>Salento Oggi sulla schermata Home.</strong> Si apre con un tocco, come un'app.</p>` +
      `<div class="install-actions"><button type="button" class="btn install-go" data-action="install">Aggiungi</button>${CLOSE}</div></div>`;
  }
  if (mode === "ios") {
    return `<div class="install-banner"><p class="install-text"><strong>Salento Oggi sulla schermata Home.</strong> Tocca Condividi, poi «Aggiungi alla schermata Home».</p>` +
      `<div class="install-actions">${CLOSE}</div></div>`;
  }
  return "";
}
