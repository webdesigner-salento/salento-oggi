import { test } from "node:test";
import assert from "node:assert/strict";
import { installMode, recordVisit, renderInstallBanner, shouldShowInstallPrompt } from "../js/install.js";
import { createStore } from "../js/store.js";

test("shouldShowInstallPrompt: mai prima della terza visita, una sola volta", () => {
  assert.equal(shouldShowInstallPrompt(1, false), false);
  assert.equal(shouldShowInstallPrompt(2, false), false);
  assert.equal(shouldShowInstallPrompt(3, false), true);
  assert.equal(shouldShowInstallPrompt(3, true), false);
  assert.equal(shouldShowInstallPrompt(10, true), false);
});

test("shouldShowInstallPrompt: se alla terza visita non era possibile, compare alla prima occasione utile", () => {
  assert.equal(shouldShowInstallPrompt(4, false), true);
});

test("shouldShowInstallPrompt: valori non validi non mostrano nulla", () => {
  for (const visits of [0, -1, NaN, undefined, null, "3"]) assert.equal(shouldShowInstallPrompt(visits, false), false, String(visits));
});

test("recordVisit: conta un giorno una volta sola, anche con molte aperture", () => {
  const store = createStore(null);
  const morning = new Date(2026, 9, 14, 8, 0);
  const evening = new Date(2026, 9, 14, 21, 0);
  assert.equal(recordVisit(store, morning), 1);
  assert.equal(recordVisit(store, evening), 1);
  assert.equal(recordVisit(store, evening), 1);
  assert.equal(recordVisit(store, new Date(2026, 9, 15, 8, 0)), 2);
  assert.equal(recordVisit(store, new Date(2026, 9, 17, 8, 0)), 3);
});

test("recordVisit: con dati salvati rovinati riparte da 1 senza errori", () => {
  const store = createStore(null);
  store.set("visits", "tanti");
  store.set("lastVisitDay", { a: 1 });
  assert.equal(recordVisit(store, new Date(2026, 9, 14)), 1);
});

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

test("installMode: già installata → nessun invito", () => {
  assert.equal(installMode({ standalone: true, hasPrompt: true, userAgent: ANDROID }), "none");
  assert.equal(installMode({ standalone: true, userAgent: IPHONE }), "none");
});

test("installMode: con l'evento del browser si può installare con un tocco", () => {
  assert.equal(installMode({ standalone: false, hasPrompt: true, userAgent: ANDROID }), "prompt");
});

test("installMode: su iPhone e iPad si spiega come aggiungere alla Home", () => {
  assert.equal(installMode({ userAgent: IPHONE }), "ios");
  const ipadAsMac = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 };
  assert.equal(installMode(ipadAsMac), "ios");
});

test("installMode: un computer o un browser senza possibilità di installare non vede nulla", () => {
  assert.equal(installMode({ userAgent: ANDROID }), "none");
  assert.equal(installMode({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 }), "none");
  assert.equal(installMode({}), "none");
  assert.equal(installMode(), "none");
});

test("renderInstallBanner: un invito per modalità, mai un popup modale, con il pulsante per chiuderlo", () => {
  assert.equal(renderInstallBanner("none"), "");
  assert.equal(renderInstallBanner("boh"), "");
  const prompt = renderInstallBanner("prompt");
  assert.match(prompt, /data-action="install"/);
  assert.match(prompt, /data-action="dismiss-install"/);
  assert.doesNotMatch(prompt, /role="dialog"|aria-modal/);
  const ios = renderInstallBanner("ios");
  assert.match(ios, /Aggiungi alla schermata Home/);
  assert.match(ios, /data-action="dismiss-install"/);
  assert.doesNotMatch(ios, /data-action="install"/);
});
