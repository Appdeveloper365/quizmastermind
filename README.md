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

## NVIDIA proxy setup (one-time, free — required for the NVIDIA NIM option)

NVIDIA's API (integrate.api.nvidia.com) does not allow direct browser calls (CORS), so the app
routes NVIDIA traffic through your own tiny Cloudflare Worker pass-through proxy. Your API key is
only forwarded through your worker to NVIDIA — the worker stores nothing.

1. Open a terminal in this repo's `cloudflare/` folder.
2. `npx wrangler login`  → browser opens, sign in / create a free Cloudflare account.
3. `npx wrangler deploy`  → prints your worker URL, e.g.
   `https://quizmastermind-nvidia-proxy.<your-subdomain>.workers.dev`
4. In the app: AI settings → Use my API key → NVIDIA → paste that URL into **1b. NVIDIA proxy URL**,
   then paste your `nvapi-...` key from https://build.nvidia.com/settings/api-keys and Save.

The worker (`cloudflare/nvidia-cors-proxy.js`) only forwards POSTs to NVIDIA's chat/completions
endpoint and adds the CORS headers NVIDIA's own server omits.

## Privacy policy

public/privacy-policy.html — local PIN-encrypted keys, IndexedDB quiz history, prompts go only
to your chosen AI provider under its own policy. No analytics, ads, accounts on this site.

