# Quiz Mastermind — AI trivia quiz agent (PWA + APK-ready)

Run from the project folder.

## One-time first push

git init
git add .
git commit -m "Quiz Mastermind — PWA + AI quiz app"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git   # ← replace with your new repo
git push -u origin main

(You already have `gh` logged in and it stores the token in the Windows keyring token-handler, so `git push` uses that — no PAT paste needed. If you still see "read-only," the repo you pointed at doesn't grant you write, or it was created by a different account.)

Future deploys:
git push   # GitHub Pages rebuilds automatically via .github/workflows/deploy-pages.yml

## Host URLs (once Pages is on, Settings → Pages → Source: GitHub Actions)

Live:   https://USERNAME.github.io/REPO/
Privacy policy: https://USERNAME.github.io/REPO/privacy-policy.html

## Custom domain (only if you own it, e.g. appdeveloper365.quizmastermind.app)

- Create `public/CNAME` with one line:  appdeveloper365.quizmastermind.app
- git add public/CNAME && git commit -m "add cname" && git push
- At your domain registrar: CNAME  appdeveloper365  →  appdeveloper365.github.io.
- GitHub Settings → Pages → Custom domain → enter appdeveloper365.quizmastermind.app → Save
- Wait for the .app TLS cert (GitHub issues automatically) → Enable "Enforce HTTPS"

## APK (hosted from same repo Releases)

Host the site first, then:

Route A (easiest, no tooling):
  https://www.pwabuilder.com  → paste Host URL → Package → Android → download signed APK
  → GitHub Releases → add to release → publish
  In-app already links to: sidebar "🤖 Android APK — GitHub Releases"

Route B (full control):
  npm i -g @bubblewrap/cli
  bubblewrap init --manifest="https://USERNAME.github.io/REPO/manifest.webmanifest"
  bubblewrap build   # keeps android.keystore + passwords — reuse to sign future updates
  Upload the APK to GitHub Releases as above.

## PWA

manifest.webmanifest, sw.js, icons/ are all relative-path; .nojekyll is included so icons/
and other files serve correctly on Pages. An in-app "📲 Install as app" button appears via
beforeinstallprompt (Android/Chrome/Edge desktop; iOS via Share → Add to Home Screen).

## Local AI models (Ollama / LM Studio / in-browser WebLLM)

The app can use models running **on your own device** — free, private, works offline:

1. **In-browser AI (WebLLM)** — no install, no key, no account: AI settings → 💻 Local AI →
   "Run AI in this browser" → pick a compact model → Enable. The model downloads once
   (Chrome/Edge with WebGPU), then generates questions fully offline. It's also the automatic
   last-resort fallback when cloud providers fail.
2. **Ollama / LM Studio** — install [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai)
   and start it. (Ollama: `ollama pull llama3.2` then `ollama serve`. LM Studio: download a model
   and start the local server.) Then press **💻 Local AI** → **🔄 Detect local models** — the app
   probes localhost, finds the server and lists every installed model automatically.
3. Pick a model → **💾 Use this model &amp; close**. No API key, no cloud, no account.

## AI providers

- **☁️ Puter** — free cloud AI on your own Puter account, no API key. Press **☁️ Puter**, sign in, done.
- **🔑 Remote API key** — bring a free key from Gemini, Groq, Pollinations, OpenRouter or xAI. Press **🔑 Remote API key**, paste, save. (Pollinations: free key at enter.pollinations.ai/keys, no card — one key routes to many models.)

## Privacy policy

public/privacy-policy.html — local API keys (PIN-free, masked in the UI), IndexedDB quiz history, prompts go only
to your chosen AI provider under its own policy. No analytics, ads, accounts on this site.

