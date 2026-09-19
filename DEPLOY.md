# 🚀 Quiz Mastermind — Deploy, Domain, Privacy, PWA & APK

Everything needed to push this app to GitHub, host it, and ship the PWA + APK.

---

## 1️⃣ Which URL should you use?

| Option | URL | Requirements |
|---|---|---|
| **A. GitHub Pages (free, recommended first)** | `https://appdeveloper365.github.io/quizmastermind/` | Just a public repo — zero config, auto-HTTPS |
| **B. Custom subdomain** | `https://appdeveloper365.quizmastermind.app` | **Only if you own the domain `quizmastermind.app`** |

**Answer to your question:** yes, `appdeveloper365.quizmastermind.app` is a valid Pages custom
domain — **but only if you own `quizmastermind.app`** (note the spelling: it's *quizmastermind*,
your message had "quizmastemind" without the "r" — the DNS record must match the domain you
actually registered). If you don't own it, start with Option A today and add B later — this build
supports both with **zero code changes** (all paths are relative).

The repo URL itself is: `https://github.com/appdeveloper365/quizmastermind`

---

## 2️⃣ One-time push (copy-paste)

Run from the project folder:

```bash
git init
git add .
git commit -m "Quiz Mastermind — PWA + AI quiz app"
git branch -M main
git remote add origin https://github.com/appdeveloper365/quizmastermind.git
git push -u origin main
```

(Create the empty repo first at github.com/new — name it exactly `quizmastermind`,
Public, **no** README/.gitignore/license — this repo already has them.)

`.gitignore` already excludes `node_modules/`, `dist/`, `.env`, `legacy/`, and local agent config.

---

## 3️⃣ Turn on hosting (30 seconds)

1. GitHub repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. The included workflow (`.github/workflows/deploy-pages.yml`) already ran on your push.
3. Done. Your site is live at:

```
Host URL:          https://appdeveloper365.github.io/quizmastermind/
Privacy Policy:    https://appdeveloper365.github.io/quizmastermind/privacy-policy.html
```

Every future `git push` to `main` redeploys automatically.

> `public/.nojekyll` is already included, so files like `icons/` serve correctly without Jekyll processing.

---

## 4️⃣ Optional: the custom domain (`appdeveloper365.quizmastermind.app`)

Skip this until/unless you own `quizmastermind.app`.

1. **DNS** (at your domain registrar): add
   `CNAME  appdeveloper365  →  appdeveloper365.github.io.`
2. **Repo**: create a file `public/CNAME` containing exactly one line:
   `appdeveloper365.quizmastermind.app` — commit + push.
3. **GitHub**: Settings → Pages → Custom domain → enter
   `appdeveloper365.quizmastermind.app` → Save → wait for the TLS certificate
   (`.app` requires HTTPS — GitHub issues it automatically, typically within minutes) →
   enable **Enforce HTTPS**.
4. Site is now also live at `https://appdeveloper365.quizmastermind.app/` with the same build.
   Your URLs for registration become:
   - Host: `https://appdeveloper365.quizmastermind.app/`
   - Privacy: `https://appdeveloper365.quizmastermind.app/privacy-policy.html`

---

## 5️⃣ PWA (already wired — just host it)

Included and configured: `manifest.webmanifest` (relative `start_url`/`scope`), service worker
(`sw.js`, offline shell, relative paths), icons (192 + 512, maskable), and an in-app
**"📲 Install as app (PWA)"** button that appears via `beforeinstallprompt`.

- **Android/Chrome/Edge**: visit the live URL → the install button (or the browser's Install icon) → app installs standalone.
- **iOS Safari**: Share → *Add to Home Screen*.
- **Desktop Chrome/Edge**: install icon in the address bar.

After deploy, validate at `https://appdeveloper365.github.io/quizmastermind/` with Chrome DevTools → Application → Manifest.

---

## 6️⃣ Android APK (hosted from the same repo URL)

The APK is a **Trusted Web Activity** wrapper around the hosted PWA — so the website must be
live first (Step 3). Two routes:

### Route A — PWABuilder (no tooling, ~10 minutes)
1. Go to **https://www.pwabuilder.com** → paste your Host URL → **Start**
2. **Package for stores → Android → Download**
3. You get a signed APK (+ AAB for Play). Test-install the APK on an Android phone
   (Settings → allow install from this source).
4. **Host it from the same URL family:** repo → **Releases → Draft a new release** →
   drag the APK in → publish. It's then downloadable at
   `https://github.com/appdeveloper365/quizmastermind/releases` —
   which the in-app **“🤖 Android APK”** link already points to.

### Route B — Bubblewrap CLI (full control)
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest="https://appdeveloper365.github.io/quizmastermind/manifest.webmanifest"
bubblewrap build          # creates android.keystore + app-release-signed.zip
```
Keep `android.keystore` and its passwords safe — every update to the APK must be signed
with the same key. Upload the APK to GitHub Releases as in Route A, step 4.

> Play Store (optional): upload the **AAB** from either route; the SHA-256 fingerprint it shows
> must also be added as `assetlinks.json` if you want to remove the browser URL bar — PWABuilder
> generates that file for you; host it at `public/.well-known/assetlinks.json` and redeploy.

---

## 7️⃣ Registrations that need the two URLs

- **Puter developer dashboard** (optional — Puter AI already works user-pays without it):
  https://developer.puter.com → create app → set **Origin/Host URL** and **Privacy Policy URL**
  to the values from Step 3 (or Step 4 if you switched domains).
- Any store listing (Play Store etc.) also asks for: Host URL, Privacy Policy URL — same values.

---

## 8️⃣ Updating the site later

```bash
git add .
git commit -m "update"
git push
```
Pages redeploys automatically (~1 minute). Bump `CACHE` in `public/sw.js` when you change
the app shell so installed PWAs pick up the new version.
