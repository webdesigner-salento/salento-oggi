import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml, renderCard, renderPlaceholder, renderChips, renderEmpty, renderSourceRow,
  formatDateline, formatClock, formatUpdated, renderDigestRow,
} from "../js/render.js";

const NOW = new Date("2026-10-14T10:30:00Z"); // 12:30 a Lecce (CEST)
const item = (over = {}) => ({
  id: "abc123", title: "Incendio a Mesagne nella notte", summary: "Le fiamme sono partite da un capannone.",
  image: "https://img.example/a.jpg", url: "https://giornale.example/a", source: "Corriere Salentino",
  category: "Cronaca", zone: "Brindisi", published_at: new Date(NOW.getTime() - 12 * 60_000).toISOString(), ...over,
});
const count = (str, sub) => str.split(sub).length - 1;

test("escapeHtml: caratteri speciali, null e undefined", () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(42), "42");
});

test("renderCard: con immagine mostra img lazy, link esterno sicuro, fonte e tempo relativo", () => {
  const html = renderCard(item(), { now: NOW });
  assert.match(html, /<img [^>]*src="https:\/\/img\.example\/a\.jpg"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /href="https:\/\/giornale\.example\/a"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener"/);
  assert.match(html, /Corriere Salentino/);
  assert.match(html, /<time datetime="[^"]+">12 min fa<\/time>/);
});

test("renderCard: senza immagine mostra il segnaposto e mai img/null/undefined", () => {
  for (const image of [null, undefined, "", "javascript:alert(1)", "data:image/png;base64,AAAA"]) {
    const html = renderCard(item({ image }), { now: NOW });
    assert.match(html, /class="ph"/, `image=${image}`);
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /src="null"|undefined|>null</);
  }
});

test("renderCard: titolo, fonte e url con caratteri speciali vengono escapati", () => {
  const html = renderCard(
    item({ title: `<script>alert(1)</script> "virgolette" & co`, source: `Fonte "A" <b>`, url: `https://x.example/?a="1"&b=<2>` }),
    { now: NOW },
  );
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;virgolette&quot; &amp; co/);
  assert.match(html, /data-source="Fonte &quot;A&quot; &lt;b&gt;"/);
  assert.match(html, /href="https:\/\/x\.example\/\?a=&quot;1&quot;&amp;b=&lt;2&gt;"/);
});

test("renderCard: url non http(s) non diventa mai un link", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "//evil.example", "", null]) {
    const html = renderCard(item({ url }), { now: NOW });
    assert.doesNotMatch(html, /href=/, `url=${url}`);
    assert.match(html, /Incendio a Mesagne/);
  }
});

test("renderCard: titolo lunghissimo non rompe il markup", () => {
  const title = "<b>".repeat(500) + "parola".repeat(2000);
  const html = renderCard(item({ title }), { now: NOW });
  assert.equal(count(html, "<article"), 1);
  assert.equal(count(html, "</article>"), 1);
  assert.equal(count(html, "<b>"), 0);
  assert.ok(html.includes("&lt;b&gt;&lt;b&gt;"));
});

test("renderCard: stato salvato visibile e accessibile", () => {
  const saved = renderCard(item(), { now: NOW, saved: true });
  assert.match(saved, /aria-pressed="true"/);
  assert.match(saved, /is-saved/);
  assert.match(saved, /Rimuovi dai preferiti/);
  const notSaved = renderCard(item(), { now: NOW, saved: false });
  assert.match(notSaved, /aria-pressed="false"/);
  assert.doesNotMatch(notSaved, /is-saved/);
  assert.match(notSaved, /Salva nei preferiti/);
});

test("renderCard: l'anteprima compare solo nella scheda guida; data non valida omette <time>", () => {
  assert.match(renderCard(item(), { now: NOW, lead: true }), /Le fiamme sono partite/);
  assert.doesNotMatch(renderCard(item(), { now: NOW }), /Le fiamme sono partite/);
  assert.doesNotMatch(renderCard(item({ published_at: "boh" }), { now: NOW }), /<time/);
  assert.match(renderCard(item(), { now: NOW, lead: true }), /card--lead/);
});

test("renderCard: ha pulsanti salva e condividi con data-action", () => {
  const html = renderCard(item(), { now: NOW });
  assert.match(html, /data-action="save"/);
  assert.match(html, /data-action="share"/);
  assert.match(html, /data-id="abc123"/);
});

test("renderPlaceholder: stabile per fonte, escapato, con ripiego", () => {
  const a = renderPlaceholder("Corriere Salentino");
  assert.equal(a, renderPlaceholder("Corriere Salentino"));
  assert.notEqual(a, renderPlaceholder("Telerama"));
  assert.match(a, /Corriere Salentino/);
  assert.match(a, /--h:\d{1,3}/);
  assert.doesNotMatch(renderPlaceholder("<i>x</i>"), /<i>/);
  assert.match(renderPlaceholder(""), /Salento/);
  assert.match(renderPlaceholder(null), /Salento/);
});

test("renderChips: un solo selezionato, valori ed etichette escapati", () => {
  const html = renderChips({
    name: "zone", options: [{ value: "Tutto", label: "Tutto il Salento" }, { value: "Lecce", label: "Lec<ce>" }], selected: "Lecce",
  });
  assert.equal(count(html, 'aria-pressed="true"'), 1);
  assert.match(html, /data-filter="zone"/);
  assert.match(html, /data-value="Lecce"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-value="Lecce"/);
  assert.match(html, /Lec&lt;ce&gt;/);
});

test("renderEmpty: titolo, testo e azione opzionale", () => {
  const html = renderEmpty({ title: "Nessuna notizia al momento", text: "Riprova più tardi.", action: { label: "Riprova", action: "retry" } });
  assert.match(html, /Nessuna notizia al momento/);
  assert.match(html, /data-action="retry"/);
  assert.doesNotMatch(renderEmpty({ title: "T", text: "x" }), /<button/);
});

test("renderSourceRow: interruttore, stato e nome escapato", () => {
  const ok = renderSourceRow({ source: 'Fonte "A"', ok: true, last_ok: "2026-10-14T10:30:00Z" }, { enabled: true, timeZone: "Europe/Rome" });
  assert.match(ok, /data-source="Fonte &quot;A&quot;"/);
  assert.match(ok, /role="switch"/);
  assert.match(ok, /checked/);
  assert.match(ok, /Aggiornata alle 12:30/);
  const down = renderSourceRow({ source: "B", ok: false, last_ok: null }, { enabled: false });
  assert.doesNotMatch(down, /checked/);
  assert.match(down, /Non risponde/);
  const stale = renderSourceRow({ source: "C", ok: false, last_ok: "2026-10-14T10:30:00Z" }, { enabled: true, timeZone: "Europe/Rome" });
  assert.match(stale, /Non risponde, ultime notizie alle 12:30/);
});

test("formatDateline / formatClock / formatUpdated", () => {
  assert.equal(formatDateline(NOW, "Europe/Rome"), "mercoledì 14 ottobre");
  assert.equal(formatClock("2026-10-14T10:30:00Z", "Europe/Rome"), "12:30");
  assert.equal(formatClock("boh", "Europe/Rome"), "");
  assert.equal(formatUpdated("2026-10-14T10:05:00Z", NOW, "Europe/Rome"), "Aggiornato alle 12:05");
  assert.equal(formatUpdated("2026-10-13T20:45:00Z", NOW, "Europe/Rome"), "Aggiornato il 13 ottobre alle 22:45");
  assert.equal(formatUpdated(null, NOW, "Europe/Rome"), "Non ancora aggiornato");
  assert.equal(formatUpdated("boh", NOW, "Europe/Rome"), "Non ancora aggiornato");
});

test("renderDigestRow: link sicuro, testi escapati, tempo relativo", () => {
  const html = renderDigestRow(item({ title: "<i>Titolo</i> & co", source: 'S"x' }), { now: NOW });
  assert.match(html, /<li class="digest-row">/);
  assert.match(html, /href="https:\/\/giornale\.example\/a"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener"/);
  assert.doesNotMatch(html, /<i>/);
  assert.match(html, /&lt;i&gt;Titolo&lt;\/i&gt; &amp; co/);
  assert.match(html, /12 min fa/);
  assert.doesNotMatch(renderDigestRow(item({ url: "javascript:alert(1)" }), { now: NOW }), /href=/);
});

test("renderPlaceholder: le fonti note hanno colori ben distinti tra loro", () => {
  const names = ["Corriere Salentino", "Telerama", "LeccePrima", "Il Grande Salento"];
  const hues = names.map((name) => Number(renderPlaceholder(name).match(/--h:(\d+)/)[1]));
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      const gap = Math.abs(hues[i] - hues[j]);
      assert.ok(Math.min(gap, 360 - gap) >= 30, `${names[i]} (${hues[i]}) e ${names[j]} (${hues[j]}) sono troppo vicini`);
    }
  }
});
