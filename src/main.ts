import { QuizEngine } from "./quiz/engine";
import { selectProvider, type ProviderChoice } from "./quiz/select";
import { keyStore } from "./storage/keys";
import { loadStats, saveStats } from "./storage/game";
import { ProviderError } from "./providers/types";
import { BYOK, BYOK_IDS, quickLabel, settingsLabel, FREE_KEY_PORTAL, type ByokId } from "./providers/registry";
import { PuterProvider } from "./providers/puter";
import { DEFAULT_NVIDIA_PROXY, loadNvidiaProxy, saveNvidiaProxy } from "./providers/openai-compatible";
import { makeByokFor } from "./quiz/select";
import type { Difficulty } from "./quiz/prompt";
import type { QuizQuestion } from "./quiz/schema";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (m: string) => ($("status").textContent = m);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});

/* ---------- PWA install (Android/Chrome/Edge desktop; iOS uses Share → Add to Home Screen) ---------- */
let installPromptEvent: any = null;
const installBtn = $<HTMLButtonElement>("installBtn");
window.addEventListener("beforeinstallprompt", (ev) => {
  ev.preventDefault();
  installPromptEvent = ev;
  installBtn.hidden = false;
});
installBtn.onclick = async () => {
  if (!installPromptEvent) return;
  installPromptEvent.prompt();
  await installPromptEvent.userChoice;
  installPromptEvent = null;
  installBtn.hidden = true;
};

/* ---------- Elements ---------- */
const providerSelect = $<HTMLSelectElement>("provider");
const keySelect = $<HTMLSelectElement>("keyProvider");
const keySettings = $<HTMLDetailsElement>("keySettings");
const keySummary = $("keySummary");
const topicInput = $<HTMLInputElement>("topic");
const difficultySel = $<HTMLSelectElement>("difficulty");
const reuse = $<HTMLInputElement>("reuse");
const nextBar = $("nextBar"), nextBtn = $<HTMLButtonElement>("nextBtn"), nextFill = $("nextFill");
const autoNext = $<HTMLInputElement>("autoNext"), autoNextPref = $<HTMLInputElement>("autoNextPref");
const puterBadge = $("puterBadge");
const nvidiaProxyField = $("nvidiaProxyField");
const nvidiaProxyInput = $<HTMLInputElement>("nvidiaProxyInput");

/* ---------- State ---------- */
let engine: QuizEngine | null = null;
let currentProviderId = "";
const pinCache = new Map<string, string>();
const stats = loadStats();
let score = 0, streak = 0;
let abort: AbortController | null = null;
/** Puter needs the CDN script + a signed-in account; Auto skips it otherwise. */
let puterReady = false;

/* ---------- Preferences ---------- */
topicInput.value = localStorage.getItem("quiz.topic") ?? "";
topicInput.onchange = () => { localStorage.setItem("quiz.topic", topicInput.value.trim()); cancelPrefetch(); };
difficultySel.onchange = () => cancelPrefetch();
reuse.checked = localStorage.getItem("quiz.reuse") === "yes";
reuse.onchange = () => { localStorage.setItem("quiz.reuse", reuse.checked ? "yes" : "no"); engine = null; };
const setAuto = (on: boolean) => {
  autoNext.checked = autoNextPref.checked = on;
  localStorage.setItem("quiz.autoNext", on ? "yes" : "no");
  if (!on) stopCountdown(); else if (prefetched) startCountdown();
};
autoNext.onchange = () => setAuto(autoNext.checked);
autoNextPref.onchange = () => setAuto(autoNextPref.checked);

/* ---------- Dropdowns from registry ---------- */
{
  const grp = $<HTMLOptGroupElement>("grpByok");
  for (const id of BYOK_IDS) {
    grp.appendChild(new Option(quickLabel(BYOK[id]), id));
    keySelect.add(new Option(settingsLabel(BYOK[id]), id));
  }
}
providerSelect.value = localStorage.getItem("quiz.provider") || "auto";
providerSelect.onchange = () => { localStorage.setItem("quiz.provider", providerSelect.value); engine = null; cancelPrefetch(); renderProviderNote(); };

async function refreshKeyMarks() {
  const saved: string[] = [];
  for (const id of BYOK_IDS) {
    const has = await keyStore.has(id);
    if (has) saved.push(BYOK[id].name);
    const mark = has ? "✓ " : "";
    const q = providerSelect.querySelector<HTMLOptionElement>(`option[value="${id}"]`); if (q) q.text = mark + quickLabel(BYOK[id]);
    const s = keySelect.querySelector<HTMLOptionElement>(`option[value="${id}"]`); if (s) s.text = mark + settingsLabel(BYOK[id]);
  }
  const parts = [puterReady ? "Puter signed in" : "", saved.length ? `✓ ${saved.join(", ")} saved` : ""].filter(Boolean);
  keySummary.textContent = `⚙️ AI settings${parts.length ? " — " + parts.join(" · ") : " — nothing set up yet (tap to open)"}`;
}

function renderPortalHint() {
  const p = BYOK[keySelect.value as ByokId];
  if (!p) return;
  $("portalHint").innerHTML =
    `👉 Get your ${p.name} key here: <a href="${p.portalUrl}" target="_blank" rel="noopener"><b>${p.portalName}</b> (${p.portalUrl.replace(/^https?:\/\//, "")})</a>` +
    `<br>${p.steps}` +
    `<br>🎁 One-stop shop for free API keys: <a href="${FREE_KEY_PORTAL.url}" target="_blank" rel="noopener"><b>${FREE_KEY_PORTAL.name}</b></a>`;
  $<HTMLInputElement>("keyInput").placeholder = p.keyPrefix;
  nvidiaProxyField.hidden = keySelect.value !== "nvidia";
}
keySelect.onchange = renderPortalHint;
nvidiaProxyInput.value = loadNvidiaProxy() || DEFAULT_NVIDIA_PROXY;
nvidiaProxyInput.onchange = () => { saveNvidiaProxy(nvidiaProxyInput.value.trim()); engine = null; cancelPrefetch(); };

renderPortalHint();

function renderProviderNote() {
  const v = providerSelect.value, k = BYOK[v as ByokId];
  $("providerNote").textContent =
    v === "auto" ? "Uses the first key you've saved, otherwise Puter if you're signed in."
    : v === "puter" ? (puterReady ? "Free cloud via your Puter account — Puter picks the model automatically on their end. Signed in ✓" : "Not signed in to Puter yet — open AI settings → Puter and press “Sign in with Puter”.")
    : k ? `Free tier — needs your ${k.name} key (AI settings → Use my API key).` : "";
}
/* ---------- Tabs ---------- */
for (const t of Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"))) {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    document.querySelectorAll<HTMLElement>(".tabpane").forEach((p) => (p.hidden = p.id !== `tab-${t.dataset.tab}`));
  };
}
document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((b) => {
  b.onclick = async () => { await navigator.clipboard.writeText($(b.dataset.copy!).textContent ?? ""); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1500); };
});

/* ---------- Puter (free cloud, sign-in) ---------- */
async function checkPuter() {
  puterBadge.className = `badge ${PuterProvider.isSignedIn() ? "ok" : PuterProvider.isLoaded() ? "wait" : "off"}`;
  puterBadge.textContent = PuterProvider.isSignedIn()
    ? "signed in"
    : PuterProvider.isLoaded() ? "signed out" : "Puter.js blocked / offline";
  puterReady = PuterProvider.isSignedIn();
  let who = "";
  try {
    const u = window.puter?.auth?.user;
    who = u?.username ? `Signed in as ${u.username}.` : "";
  } catch { /* user not available */ }
  $("puterUser").textContent = puterReady
    ? `${who} Free allowance is per-account; nothing is billed to this site.`
    : "No account yet? Press “Sign in with Puter” — it takes seconds, and one account works across every Puter app.";
  ($("usePuter") as HTMLButtonElement).disabled = !puterReady;
  await refreshKeyMarks(); renderProviderNote();
}
$("puterRecheck").onclick = () => void checkPuter();
$("puterSignIn").onclick = async () => {
  try { await PuterProvider.signIn(); await checkPuter(); }
  catch (e) { status(`⚠️ ${(e as Error).message}`); return; }
  // Immediately prove Puter recognizes the connection with a real round-trip.
  try {
    await new PuterProvider().verify();
    status("✅ Signed in — Puter recognized the connection (test call answered). Press ▶ Start.");
  } catch (e) {
    status(`⚠️ Signed in, but the test call failed: ${explainError(e)}`);
  }
};
$("puterSignOut").onclick = async () => {
  await PuterProvider.signOut(); engine = null; await checkPuter();
  if (providerSelect.value === "puter") { providerSelect.value = "auto"; localStorage.setItem("quiz.provider", "auto"); }
  status("Signed out of Puter.");
};
$("usePuter").onclick = () => {
  if (!puterReady) return status("Sign in to Puter first, then press “Use Puter & close”.");
  providerSelect.value = "puter"; providerSelect.dispatchEvent(new Event("change"));
  keySettings.open = false; status("Provider set to Puter (auto model). Press ▶ Start.");
};
$("puterTest").onclick = async () => {
  const res = $("puterTestResult");
  res.textContent = "Testing Puter…";
  try {
    await PuterProvider.waitForReady();
    if (!PuterProvider.isSignedIn()) {
      res.textContent = "❌ Not signed in yet — press “Sign in with Puter” first (Puter needs a session before it recognizes this app).";
      return;
    }
    await new PuterProvider().verify();
    res.textContent = "✅ Puter recognized the connection — a real test call was answered.";
  } catch (e) {
    res.textContent = `❌ ${explainError(e)}`;
  }
};
await checkPuter();
renderProviderNote();

/* ---------- Recent answers ---------- */
interface Recent { q: string; chosen: string; correct: string; ok: boolean; t: number }
const MAX_RECENT = 8;
let recent: Recent[] = [];
try { recent = JSON.parse(localStorage.getItem("quiz.recent") ?? "[]"); } catch { recent = []; }
function renderRecent(animateNewest = false) {
  const list = $("historyList"); list.innerHTML = "";
  if (!recent.length) { list.innerHTML = `<small class="hint">Your answered questions appear here and slowly fade back. Hover one to bring it forward.</small>`; return; }
  recent.forEach((r, i) => {
    const d = document.createElement("div");
    d.className = `hist ${r.ok ? "ok" : "bad"}${animateNewest && i === 0 ? " enter" : ""}`; d.title = r.q;
    d.innerHTML = `<div class="q">${esc(r.q)}</div><div class="a">${r.ok ? "✅" : "❌"} You: ${esc(r.chosen)}${r.ok ? "" : ` · Answer: <b>${esc(r.correct)}</b>`}</div>`;
    list.appendChild(d);
  });
}
function pushRecent(r: Recent) { recent.unshift(r); recent = recent.slice(0, MAX_RECENT); localStorage.setItem("quiz.recent", JSON.stringify(recent)); renderRecent(true); }
$("clearRecent").onclick = () => { recent = []; localStorage.removeItem("quiz.recent"); renderRecent(); };
renderRecent();

/* ---------- Helpers ---------- */
function renderStats() {
  $("stats").textContent = `Score ${score} · Streak ${streak} · Best streak ${stats.bestStreak} · High score ${stats.highScore} · Accuracy ${stats.played ? Math.round((100 * stats.correct) / stats.played) : 0}%`;
}
async function askPin(providerId: string): Promise<string> {
  if (pinCache.has(providerId)) return pinCache.get(providerId)!;
  const name = BYOK[providerId as ByokId]?.name ?? providerId;
  const pin = prompt(`Enter the lock PIN you created when saving your ${name} key.\n\n(Your own 4+ digit PIN, not the API key. Forgot it? Cancel, then Clear and re-save the key.)`) ?? "";
  pinCache.set(providerId, pin); return pin;
}
async function ensureEngine(): Promise<QuizEngine> {
  const choice = providerSelect.value as ProviderChoice;
  if (engine && currentProviderId === choice) return engine;
  status("Selecting provider…");
  const provider = await selectProvider(choice, { askPin, puterReady });
  if (!provider) throw new Error("No provider available. Add a free API key in AI settings, or sign in to Puter.");
  engine = new QuizEngine(provider, { reuseCache: reuse.checked });
  currentProviderId = choice; status(`Provider: ${provider.label}`); return engine;
}
const currentTopic = () => topicInput.value.trim() || "General knowledge";
const currentDifficulty = () => difficultySel.value as Difficulty;

function pointToSettings(tab: "puter" | "key") {
  keySettings.open = true;
  (document.querySelector(`.tab[data-tab="${tab}"]`) as HTMLButtonElement)?.click();
  keySettings.classList.remove("attention"); void keySettings.offsetWidth; keySettings.classList.add("attention");
  if (!keySettings.querySelector(".start-here")) {
    const tag = document.createElement("div"); tag.className = "start-here";
    tag.textContent = tab === "puter" ? "👉 Start here: press “Sign in with Puter” (no key to paste) — or use the API-key tab for stronger models" : "👉 Start here: pick a provider → click its link to get a free key → paste → Save & close";
    keySettings.querySelector("summary")!.insertAdjacentElement("afterend", tag);
  }
  keySettings.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => keySettings.classList.remove("attention"), 7000);
}
/* ---------- Prefetch + auto-advance ---------- */
const AUTO_DELAY_MS = 4500;
let prefetchAbort: AbortController | null = null, prefetched: QuizQuestion | null = null, prefetchKey = "", countdownRaf = 0;
const contextKey = () => `${currentTopic()}|${currentDifficulty()}|${providerSelect.value}`;
function startPrefetch() {
  cancelPrefetch();
  const ctl = new AbortController(); prefetchAbort = ctl; prefetchKey = contextKey();
  nextBar.hidden = false; nextBtn.disabled = true; nextBtn.textContent = "⏳ Generating your next question…"; nextFill.style.width = "0";
  (async () => (await ensureEngine()).next(currentTopic(), currentDifficulty(), ctl.signal))()
    .then((q) => { if (ctl.signal.aborted) return; prefetched = q; nextBtn.disabled = false; nextBtn.textContent = "Next question ▶"; if (autoNext.checked) startCountdown(); })
    .catch((e) => { if (ctl.signal.aborted) return; nextBtn.disabled = false; nextBtn.textContent = "↻ Retry next question"; status(`⚠️ ${explainError(e)}`); });
}
function cancelPrefetch() { prefetchAbort?.abort(); prefetchAbort = null; prefetched = null; prefetchKey = ""; stopCountdown(); nextBar.hidden = true; }
function startCountdown() {
  stopCountdown(); const t0 = performance.now();
  const tick = () => {
    const f = Math.min(1, (performance.now() - t0) / AUTO_DELAY_MS);
    nextFill.style.width = `${f * 100}%`;
    nextBtn.textContent = `Next question ▶  (auto in ${Math.ceil(((1 - f) * AUTO_DELAY_MS) / 1000)}s — click to go now)`;
    if (f >= 1) { void showNext(); return; }
    countdownRaf = requestAnimationFrame(tick);
  };
  countdownRaf = requestAnimationFrame(tick);
}
function stopCountdown() { if (countdownRaf) cancelAnimationFrame(countdownRaf); countdownRaf = 0; nextFill.style.width = "0"; }
async function showNext() {
  stopCountdown();
  if (prefetched && prefetchKey === contextKey()) {
    const q = prefetched; prefetched = null; prefetchAbort = null; prefetchKey = ""; nextBar.hidden = true;
    renderQuestion(q); status(`Provider: ${engine?.provider.label ?? ""}`); return;
  }
  cancelPrefetch(); await generateAndShow();
}
nextBtn.onclick = () => void showNext();
setAuto(localStorage.getItem("quiz.autoNext") !== "no");

/* ---------- Question rendering ---------- */
function renderQuestion(q: QuizQuestion) {
  $("question").textContent = q.question;
  const box = $("options"); box.innerHTML = "";
  const explain = $("explain"); explain.style.display = "none"; nextBar.hidden = true;
  q.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.textContent = `${String.fromCharCode(65 + i)}. ${opt}`;
    b.onclick = () => {
      const correct = i === q.correctIndex;
      [...box.children].forEach((el, j) => { (el as HTMLButtonElement).disabled = true; if (j === q.correctIndex) el.classList.add("correct"); else if (j === i) el.classList.add("wrong"); });
      stats.played++; if (correct) { score++; streak++; stats.correct++; } else streak = 0;
      stats.highScore = Math.max(stats.highScore, score); stats.bestStreak = Math.max(stats.bestStreak, streak); saveStats(stats);
      explain.textContent = (correct ? "✅ Correct. " : "❌ Not quite. ") + q.explanation; explain.style.display = "block";
      renderStats();
      pushRecent({ q: q.question, chosen: opt, correct: q.options[q.correctIndex], ok: correct, t: Date.now() });
      startPrefetch();
    };
    box.appendChild(b);
  });
}

function explainError(e: unknown): string {
  if (e instanceof ProviderError) {
    switch (e.kind) {
      case "auth": return e.message.startsWith("No ") ? e.message : "Your API key was rejected. Open AI settings, Clear it, and paste it again.";
      case "quota": return "Your account is out of credits / free allowance. Switch provider or wait for the daily reset.";
      case "rate_limit": return "Rate limited by the provider (free tiers have per-minute/day caps). Wait a moment or switch provider.";
      case "unsupported": return e.message;
      case "refusal": return "The model declined this topic. Try a different one.";
      default: return e.message;
    }
  }
  return (e as Error).message;
}
async function generateAndShow() {
  abort?.abort(); abort = new AbortController();
  $("start").setAttribute("disabled", "true");
  try {
    const eng = await ensureEngine();
    status(topicInput.value.trim() ? "Generating…" : "Tip: type a subject above — using “General knowledge” for now.");
    const q = await eng.next(currentTopic(), currentDifficulty(), abort.signal);
    renderQuestion(q); status(`Provider: ${eng.provider.label}`);
  } catch (e) {
    status(`⚠️ ${explainError(e)}`);
    if (e instanceof ProviderError && e.kind === "auth") pinCache.clear();
    if (!(e instanceof ProviderError) || e.kind !== "rate_limit") engine = null;
    const msg = (e as Error).message ?? "";
    if (/No provider available/.test(msg)) pointToSettings("key");
    else if (/^No .* key saved/.test(msg)) pointToSettings("key");
    else if (/Puter/i.test(msg)) pointToSettings("puter");
  } finally { $("start").removeAttribute("disabled"); }
}

/* ---------- Events ---------- */
$("start").onclick = () => void showNext();
$("saveClose").onclick = async () => {
  const id = keySelect.value as ByokId, info = BYOK[id];
  const key = $<HTMLInputElement>("keyInput").value.trim(), pin = $<HTMLInputElement>("pinInput").value;
  if (!key) return status(`Step 3: paste your ${info.name} API key first (get it from ${info.portalName}).`);
  if (pin.length < 4) return status("Step 2: create a lock PIN of at least 4 digits.");
  if (id === "nvidia" && !loadNvidiaProxy() && !DEFAULT_NVIDIA_PROXY) return status("NVIDIA also needs its proxy URL (step 1b): deploy the free worker once (README → “NVIDIA proxy setup”), then paste its https://…workers.dev URL there.");
  await keyStore.save(id, key, pin); pinCache.set(id, pin);
  $<HTMLInputElement>("keyInput").value = ""; $<HTMLInputElement>("pinInput").value = "";
  providerSelect.value = id; localStorage.setItem("quiz.provider", id); engine = null; cancelPrefetch();
  await refreshKeyMarks(); renderProviderNote();
  keySettings.querySelector(".start-here")?.remove(); keySettings.classList.remove("attention"); keySettings.open = false;
  $("start").scrollIntoView({ behavior: "smooth", block: "center" });
  status(`✅ ${info.name} key saved. Provider set to "${quickLabel(info)}". Press ▶ Start.`);
};
$("clearKey").onclick = async () => {
  const id = keySelect.value as ByokId;
  await keyStore.clear(id); pinCache.delete(id); engine = null; cancelPrefetch();
  if (providerSelect.value === id) { providerSelect.value = "auto"; localStorage.setItem("quiz.provider", "auto"); }
  await refreshKeyMarks(); renderProviderNote(); status(`Cleared ${BYOK[id].name} key.`);
};
$("closeSettings").onclick = () => { keySettings.open = false; };
$("resetHistory").onclick = async () => {
  const topic = currentTopic(); await QuizEngine.resetHistory(topic, currentDifficulty()); cancelPrefetch();
  status(`🔄 Forgot your history for "${topic}" (${difficultySel.value}).`);
};
renderStats();

/* ---------- Test connection (BYOK tab) ---------- */
$("testKey").onclick = async () => {
  const res = $("testResult");
  const id = keySelect.value as ByokId;
  const info = BYOK[id];
  const typed = $<HTMLInputElement>("keyInput").value.trim();
  res.textContent = `Testing ${info.name}…`;
  try {
    let key = typed;
    if (!key) {
      if (!(await keyStore.has(id))) throw new ProviderError("auth", `Paste your ${info.name} key above first, then press Test connection.`);
      key = await keyStore.load(id, await askPin(id));
    }
    const p = makeByokFor(id, key);
    await p.verify();
    res.textContent = `✅ ${info.name} connection verified — key, endpoint and model all work.`;
    status(`✅ ${info.name} test passed.`);
  } catch (e) {
    res.textContent = `❌ ${explainError(e)}`;
    status(`⚠️ ${info.name} test failed.`);
  }
};

