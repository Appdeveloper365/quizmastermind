# Shipping risk review — Quiz Mastermind

**Date:** 2026-10-08 · **Scope:** everything reachable at the deployed site (`appdeveloper365.github.io/quizmastermind`), the public GitHub repo, the PWA/APK distribution, and the AI-provider integrations.
**Purpose:** find what could hurt the maintainer (legal, financial, security, reputational) before/while shipping, and fix what can be fixed in code.

Severity = likelihood × impact *if it happens*. Status = **FIXED** (changed in this pass), **MITIGATED** (partly fixed, residual risk stated), **DECIDE** (needs your call), **ACCEPTED** (understood, intentionally left alone).

---

## What I verified is already safe

| Check | Result |
|---|---|
| Secrets in the public repo | **Clean.** Pattern-scanned all tracked files for key formats (`sk-`, `AIza`, `gsk_`, `ghp_`, `xai-`, Bearer…). `.env` is gitignored and has **never** been committed (`git log --diff-filter=A` on `.env` = empty). `.env.example` holds placeholders only. |
| XSS (the one bug class that would expose users' stored API keys) | **Clean.** All AI-generated and user text is written with `textContent` or the `esc()` HTML-escaper; the only `innerHTML` writes use static/registry strings or `esc()`. No `insertAdjacentHTML`, no `document.write`. |
| Agent/config files leaking | `.claude/`, `.continue/`, `.clinerules` are gitignored (added in the stability pass). |
| Broken builds reaching users | CI (`deploy-pages.yml`) gates typecheck + 40 tests + build; a failing change simply never deploys. |
| Open-source licence grant | None — repo has **no LICENSE**, so all rights are reserved by default (this protects you; see D1). |

---

## Findings

### HIGH — fixed in this pass

**H1 · Privacy policy did not match the build, and nothing linked to it.**
The old policy listed **NVIDIA** as a provider (not in the app), omitted **Pollinations** (which is), never mentioned the in-browser model download (WebLLM → Hugging Face), localhost calls, GitHub Pages hosting, or that a third-party script (`js.puter.com`) runs on the page — and **no page in the app linked to it**, so users never saw it.
→ Rewrote `public/privacy-policy.html` to describe exactly what the code does (storage: `localStorage` / `IndexedDB` / `Cache Storage`; outbound: prompt contents, per-provider hostnames and their policies; the honest warning that keys are obfuscated, not encrypted). Added a footer on the main page with **Privacy Policy · Terms of Use · Source code**, plus `<meta name="description">`.

**H2 · No Terms of Use at all.**
A free app distributing an APK, taking people's API keys and generating content carries warranty/liability exposure with zero written terms.
→ Created `public/terms.html`: acceptance, third-party-provider separation, **AI-content accuracy disclaimer** (§5), acceptable use, age clause, all-rights-reserved IP (§8), *as-is* warranty disclaimer (§9), **liability capped at $0** (§10), indemnity (§11), APK/sideload risk (§12), change/severability terms (§13). Per your decision: **no governing-law clause.**

**H3 · Third-party script executed on every page load while users' API keys sit in `localStorage`.**
`<script src="https://js.puter.com/v2/">` ran unconditionally for everyone — including every user who only uses their own key or a local model. Any compromise of that CDN/endpoint (supply-chain) could read `quiz.key.*` and exfiltrate it.
→ The tag is now **injected on demand** (`PuterProvider.ensureInjected()`), only when the user picks Puter, presses Sign in / Re-check, or already has Puter selected (`src/providers/puter.ts`, `src/main.ts`). Verified: no Puter tag at load; injecting on click fully loads the SDK (`puter.ai.chat` present); badge states now read `not loaded (loads on demand)` → `loading Puter.js…` → `signed out`.

**H4 · No Content-Security-Policy.**
Any injected script could load remote code and phone the result out — the exact combination that turns a future markup bug into stolen keys.
→ Added an allowlist CSP in `index.html`: `script-src` = this origin + `js.puter.com` + `'wasm-unsafe-eval'`; `connect-src` = the five BYOK endpoints, Puter's own hosts (extracted from their actual SDK bundle), the Hugging Face model hosts, `raw.githubusercontent.com`, and `http://localhost:*`/`127.0.0.1` for Ollama/LM Studio; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-src` for Puter's auth frames.
Verified live: page + styles render, **WebLLM question generation works** (3.7 s, 4 options — caught and fixed a real violation: WebAssembly compilation needs `'wasm-unsafe-eval'`, which still blocks plain `eval`), **Ollama detection works** (4 models found on `localhost:11434`), **service worker + caches register**, Puter SDK loads on demand. Zero console errors.

### MEDIUM — residual risk you should know about

**M1 · Puter's sign-in popup can't be end-to-end tested under the new CSP.** *(MITIGATED)*
Completing OAuth needs a real Puter account, so I verified everything up to `puter.ai.chat` loading but not the login popup itself. All hosts Puter's bundle references are allowlisted, but if their auth calls something new, sign-in breaks silently for users.
→ **Action after deploy:** click **☁️ Puter → Sign in** once. If it fails, the fix is one line: add the origin to `connect-src` in `index.html` (comment marks the spot).

**M2 · Stored API keys are obfuscated, not encrypted.** *(ACCEPTED + DISCLOSED)*
Keys live in `localStorage` as base64 — readable by any script running on this origin or by anyone with the browser profile. The CSP (H4) and lazy Puter script (H3) shrink the attack surface considerably, and the privacy policy now warns users plainly: don't save a key on a shared/public device; use "🗑 Clear this key".
→ **Optional future work:** encrypt keys behind a user PIN, or keep them session-only. Not done now — it would add friction for a threat model the CSP already covers for this app's size.

**M3 · AI output can be wrong or unsuitable.** *(MITIGATED)*
Prompts ask for accurate, all-ages trivia, and the engine rejects malformed/near-duplicate/instruction-echo output — but a model can still present a wrong fact as "the correct answer". A learner or teacher relying on it is the reputational risk.
→ Footer line ("Questions are AI-generated and can be wrong — check anything that matters"), Terms §5 (not advice; verify; not for grading/certification), privacy §5 (not directed at under-13s; supervise younger users).

**M4 · Free third-party tiers can change or die.** *(ACCEPTED)*
Puter quotas, Groq/Gemini/Pollinations free limits and model availability are theirs to change. The app already retries (5 attempts), falls back across providers and replays saved questions, so users see a graceful error rather than a dead app. Terms §3 puts the cost/quota relationship between the user and the provider. Developer cost exposure stays **$0** by design ("user-pays" Puter, BYOK keys, user's own machine).

**M5 · The Android APK is sideloaded from GitHub Releases.** *(DECIDE)*
It's built outside this repo (PWABuilder/bubblewrap, see README), so its permissions and package signature aren't reviewable here. Sideloaded installs are a trust decision users make, and Play Store distribution would add policy obligations (data-safety form, content rating).
→ **Decide:** publish the APK's permissions/package in the release notes, or move to Play Store if you distribute widely. Never lose the signing keystore (README Route B).

**M6 · Dead artifacts in the public repo.** *(DECIDE)*
No secrets in them (verified), but they advertise internal tooling and one is an **unused CORS pass-through proxy for an NVIDIA API the app no longer uses** (`cloudflare/nvidia-cors-proxy.js`): if it's still deployed on your Cloudflare account it's a public relay others can use (with their own key) and a billable resource you may have forgotten about.
→ **Decide:** delete `cloudflare/`, `dev_log.txt`, `auto-cline.mjs`, `auto-local.mjs`, `.env.example` (or keep them and just delete the deployed Worker). Also `@cline/sdk` (`"latest"` — unpinned) and `dotenv` sit in `dependencies` though the shipped bundle uses neither; moving them to `devDependencies` narrows install-time supply chain.

### LOW — understood, left as is

**L1 · No LICENSE.** Public code with no licence = all rights reserved (good for you). Consider adding `README` line: *"Source is visible for review; no licence is granted for reuse."* If you *want* forks/contributions, pick an explicit licence instead. **DECIDE.**

**L2 · GitHub Pages is the host.** GitHub processes IPs/user agents as your host (now disclosed in the policy). Outage/termination of Pages is outside your control; the build is reproducible locally, so you could move to Cloudflare Pages/Netlify without a code change (relative `base: "./"`).

**L3 · Service-worker staleness.** Users may briefly see a cached old shell after a release; the cache version bump (`quiz-mastermind-v8`) handles cleanup. Bump on UI-structural releases.

**L4 · `http://localhost` calls (Ollama/LM Studio).** Mixed-content-ish but browser-sanctioned for localhost; some strict extensions block it. Already surfaced as a friendly error; the in-browser alternative (WebLLM) covers those users.

**L5 · `script-src 'wasm-unsafe-eval'`.** Required by WebLLM; it does **not** permit `eval()`/`new Function()` or remote script loading.

---

## Decisions for you

| # | Decision | My suggestion |
|---|---|---|
| D1 | Licence for the public source | Add the "no licence granted" README line (keep all rights) unless you want contributions. |
| D2 | Delete `cloudflare/`, `dev_log.txt`, `auto-*.mjs`, `.env.example`; check for a deployed NVIDIA Worker | Delete; kill the Worker if it exists. |
| D3 | Move `@cline/sdk` + `dotenv` to `devDependencies` | Yes — the shipped app imports neither. |
| D4 | After deploy, test **Puter sign-in** once | Mandatory smoke test (M1). |
| D5 | APK: document permissions vs. Play Store | Document permissions now; Play Store only if you want wide distribution. |
| D6 | Adding a governing-law clause later | Leave out until you know where most users are / where you'd ever litigate. |

## Files changed in this pass

- `index.html` — CSP meta, `<meta name="description">`, legal footer (Privacy · Terms · Source), Puter tag removed.
- `src/providers/puter.ts` — `isInjected()` / `ensureInjected()`; `waitForReady()` injects first.
- `src/main.ts` — on-demand load (`loadPuterSdk()`), badge states, load only at startup when Puter is chosen.
- `public/privacy-policy.html` — rewritten to match the build.
- `public/terms.html` — new.
- `docs/app-description.md` — copy-ready descriptions (this review's companion).
