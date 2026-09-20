import { QuizEngine } from "./quiz/engine";
import { providerChain, choiceName, type ProviderChoice } from "./quiz/select";
import { keyStore } from "./storage/keys";
import { loadStats, saveStats } from "./storage/game";
import { ProviderError } from "./providers/types";
import { BYOK, BYOK_IDS, isByokId, FREE_KEY_PORTAL, type ByokId } from "./providers/registry";
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
/* ---------- Elements (single selection menu: #provider is the only chooser) ---------- */
const providerSelect = $<HTMLSelectElement>("provider");
const keySettings = $<HTMLDetailsElement>("keySettings");
const keySummary = $("keySummary");
const topicInput = $<HTMLInputElement>("topic");
const difficultySel = $<HTMLSelectElement>("difficulty");
const reuse = $<HTMLInputElement>("reuse");
const nextBar = $("nextBar"), nextBtn = $<HTMLButtonElement>("nextBtn"), nextFill = $("nextFill");
const autoNext = $<HTMLInputElement>("autoNext"), autoNextPref = $<HTMLInputElement>("autoNextPref");
const puterBadge = $("puterBadge");
const byokUi = $("byokUi");
const keyInput = $<HTMLInputElement>("keyInput");
const keyFieldHint = $("keyFieldHint");
const nvidiaProxyField = $("nvidiaProxyField");
const nvidiaProxyInput = $<HTMLInputElement>("nvidiaProxyInput");

/* ---------- State ---------- */
let engine: QuizEngine | null = null;
let currentProviderId = "";
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

/* ---------- Dropdown from registry (the single selection menu) ---------- */
{
  const grp = $<HTMLOptGroupElement>("grpByok");
  for (const id of BYOK_IDS) grp.appendChild(new Option(BYOK[id].name, id));
  const stored = localStorage.getItem("quiz.provider") || "auto";
  providerSelect.value = stored === "auto" || stored === "puter" || isByokId(stored) ? stored : "auto";
}
providerSelect.onchange = () => { localStorage.setItem("quiz.provider", providerSelect.value); engine = null; cancelPrefetch(); renderProviderNote(); void refreshKeyMarks(); void renderKeyUI(); };

/** The ONE selected provider for the whole app — no second dropdown anywhere. */
const providerChoice = (): ProviderChoice => providerSelect.value as ProviderChoice;

async function refreshKeyMarks() {
  const saved: string[] = [];
  for (const id of BYOK_IDS) {
    if (await keyStore.has(id)) saved.push(BYOK[id].name);
  }
  const keyList = saved.length ? `keys saved: ${saved.join(", ")}` : "no API keys saved";
  keySummary.textContent = `⚙️ AI settings — provider: ${choiceName(providerChoice())} · ${puterReady ? "Puter signed in" : "Puter off"} · ${keyList}`;
}

/* ---------- Key tab: bound to the single menu above — no second dropdown ---------- */
const currentKeyId = (): ByokId | null => {
  const v = providerSelect.value;
  return isByokId(v) ? v : null;
};

async function renderKeyUI() {
  const id = currentKeyId();
  byokUi.hidden = !id;
  if (!id) {
    $("portalHint").innerHTML = providerSelect.value === "puter"
      ? "☁️ Puter is active — it needs no API key. Manage it in the <b>☁️ Puter</b> tab. Pick a 🔑 provider in the menu above to add its key here."
      : "Pick one of the 🔑 providers in the <b>AI provider</b> menu above — this tab then shows its key link and key field. Until then there is nothing to configure here.";
    return;
  }
  const p = BYOK[id];
  $("portalHint").innerHTML =
    `👉 Get your ${p.name} key here: <a href="${p.portalUrl}" target="_blank" rel="noopener"><b>${p.portalName}</b> (${p.portalUrl.replace(/^https?:\/\//, "")})</a>` +
    `<br>${p.steps}` +
    `<br>🎁 One-stop shop for free API keys: <a href="${FREE_KEY_PORTAL.url}" target="_blank" rel="noopener"><b>${FREE_KEY_PORTAL.name}</b></a>`;
  nvidiaProxyField.hidden = id !== "nvidia";
  keyInput.placeholder = p.keyPrefix;
  const has = await keyStore.has(id);
  keyInput.disabled = has;
  keyInput.value = has ? await keyStore.load(id).catch(() => "") : "";
  $("replaceKey").hidden = !has;
  keyFieldHint.innerHTML = has
    ? `Key saved ✓ — shown as dots and locked. Press <b>✏️ Replace</b> to change it or <b>🗑 Clear</b> to remove it.`
    : `Paste your key, then <b>💾 Save</b>. After saving it appears as dots. Stored on this device only.`;
}
nvidiaProxyInput.value = loadNvidiaProxy() || DEFAULT_NVIDIA_PROXY;
nvidiaProxyInput.onchange = () => { saveNvidiaProxy(nvidiaProxyInput.value.trim()); engine = null; cancelPrefetch(); };

void renderKeyUI();
void refreshKeyMarks();

async function renderProviderNote() {
  const v = providerSelect.value, k = BYOK[v as ByokId];
  const base = v === "puter"
    ? (puterReady ? "☁️ Puter is the active provider — signed in ✓. Your own-API keys stay saved but unused." : "☁️ Puter is the active provider — open AI settings → Puter and press “Sign in with Puter”.")
    : v === "auto" ? "✨ Auto is active — the agent uses your first working key, falling back to the next one, then Puter."
    : "";
  if (k) {
    const has = await keyStore.has(v);
    $("providerNote").textContent = has
      ? `🔑 ${k.name} is the active provider — key saved ✓.`
      : `🔑 ${k.name} is the active provider — no key saved yet. Open AI settings → Use my API key.`;
    return;
  }
  $("providerNote").textContent = base;
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
/** Silent first working engine for background prefetch (the visible quiz attempt narrates its own failover). */
async function firstCandidateEngine(): Promise<QuizEngine> {
  const choice = providerChoice();
  if (engine && currentProviderId === choice) return engine;
  const chain = await providerChain(choice, { puterReady });
  if (!chain.length) throw new Error("No provider available. Add a free API key in AI settings, or sign in to Puter.");
  for (const cand of chain) {
    try {
      const provider = await cand.build();
      engine = new QuizEngine(provider, { reuseCache: reuse.checked });
      currentProviderId = cand.id; return engine;
    } catch { /* keep prefetch silent */ }
  }
  throw new Error("No provider available. Add a free API key in AI settings, or sign in to Puter.");
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
  (async () => (await firstCandidateEngine()).next(currentTopic(), currentDifficulty(), ctl.signal))()
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
  const signal = abort.signal;
  $("start").setAttribute("disabled", "true");
  try {
    if (!topicInput.value.trim()) status("Tip: type a subject above — using “General knowledge” for now.");
    const chain = await providerChain(providerChoice(), { puterReady });
    if (!chain.length) throw new Error("No provider available. Add a free API key in AI settings, or sign in to Puter.");
    const topic = topicInput.value.trim() || "General knowledge";
    let lastErr: unknown = null;
    // True-agent loop: try the selected provider, then fall back through every other working one.
    for (const cand of chain) {
      const name = choiceName(cand.id);
      try {
        status(`🤖 Agent: asking ${name}…`);
        const provider = await cand.build();
        const eng = new QuizEngine(provider, { reuseCache: reuse.checked });
        const q = await eng.next(topic, currentDifficulty(), signal);
        engine = eng; currentProviderId = cand.id;
        renderQuestion(q); status(`Provider: ${provider.label}`);
        return;
      } catch (e) {
        if (signal.aborted) return;
        lastErr = e;
        if (cand !== chain[chain.length - 1]) {
          const kind = e instanceof ProviderError ? e.kind : "unknown";
          status(`🤖 ${name} couldn't answer (${kind}) — falling back to the next provider…`);
          continue;
        }
        throw e;
      }
    }
    throw lastErr ?? new Error("No provider available.");
  } catch (e) {
    status(`⚠️ ${explainError(e)}`);
    engine = null;
    const msg = (e as Error).message ?? "";
    if (/No provider available/.test(msg)) pointToSettings("key");
    else if (/^No .* key saved/.test(msg)) pointToSettings("key");
    else if (/Puter/i.test(msg)) pointToSettings("puter");
  } finally { $("start").removeAttribute("disabled"); }
}

/* ---------- Events ---------- */
$("start").onclick = () => void showNext();
$("saveClose").onclick = async () => {
  const id = currentKeyId();
  if (!id) return status("Choose a 🔑 provider in the AI provider menu above first — then this tab shows where to paste its key.");
  const info = BYOK[id];
  const key = keyInput.disabled ? keyInput.value : keyInput.value.trim();
  if (!key) return status(`Paste your ${info.name} API key first (get it from ${info.portalName}).`);
  await keyStore.save(id, key);
  providerSelect.value = id; localStorage.setItem("quiz.provider", id); engine = null; cancelPrefetch();
  await refreshKeyMarks(); await renderProviderNote(); await renderKeyUI();
  keySettings.querySelector(".start-here")?.remove(); keySettings.classList.remove("attention"); keySettings.open = false;
  $("start").scrollIntoView({ behavior: "smooth", block: "center" });
  status(`✅ ${info.name} key saved. Provider set to “${info.name}”. Press ▶ Start.`);
};
$("replaceKey").onclick = () => {
  keyInput.value = ""; keyInput.disabled = false; keyInput.focus();
  $("replaceKey").hidden = true;
  keyFieldHint.innerHTML = `Paste the new key, then <b>💾 Save</b>.`;
};
$("clearKey").onclick = async () => {
  const id = currentKeyId();
  if (!id) return status("Choose a 🔑 provider in the AI provider menu above first.");
  await keyStore.clear(id); engine = null; cancelPrefetch();
  await refreshKeyMarks(); await renderProviderNote(); await renderKeyUI();
  status(`Cleared ${BYOK[id].name} key. The app's agent will fall back to your other working providers.`);
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
  const id = currentKeyId();
  if (!id) { res.textContent = "Choose a 🔑 provider in the AI provider menu above first."; return; }
  const info = BYOK[id];
  const typed = keyInput.disabled ? keyInput.value : keyInput.value.trim();
  res.textContent = `Testing ${info.name}…`;
  try {
    let key = typed;
    if (!key) {
      if (!(await keyStore.has(id))) throw new ProviderError("auth", `Paste your ${info.name} key above first, then press Test connection.`);
      key = await keyStore.load(id);
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

