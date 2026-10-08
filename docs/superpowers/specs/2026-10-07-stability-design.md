# Quiz Mastermind — Stability Hardening Design

Date: 2026-10-07
Scope: Sub-project #1 of 4 (Stability → Performance → Code quality → UX polish)
Goal: Make the current app reliably build, run offline/online, and fail gracefully with no new features.

## 1. Scope & Non-goals

In scope:
- Fix GitHub Pages subpath asset bug (`index.html` logo absolute path).
- Add `typecheck` + `test` scripts, wire into CI before `build`.
- Add unit tests for pure logic: `validateQuizQuestion`, `shuffleOptions`, `normalizeQuestion`, engine dedup (`tooSimilar`), provider chain fallback.
- Harden Puter CDN failure (ad-blocker/offline) — already handled in `puter.ts:waitForReady`, just surface UI state.
- Verify `npm ci && npm run typecheck && npm test && npm run build` passes locally + CI.

Non-goals: no bundle-size work, no `main.ts` split, no UI redesign, no new providers.

## 2. Architecture (no change)

Client-only Vite+TS SPA. No backend, no router. Data flow unchanged:
`main.ts` → `providerChain(choice)` → `QuizEngine.next(topic,difficulty)` → `validateQuizQuestion` → IndexedDB `seen/cache` → render.
PWA shell (`sw.js` CACHE v7) unchanged except cache-bump if `index.html` changes.

## 3. Changes

### 3a. Asset path fix (bug)
File: `index.html:94`
- `src="/app_logo.png?v=2"` → `src="./app_logo.png?v=2"`.
- Reason: `vite.config.ts` uses `base:"./"` for Pages subpath `/quizmastermind/` + custom domain. Absolute `/` breaks on subpath, falls back to SVG.
- Verify: `npm run build && grep -o 'app_logo[^"]*' dist/index.html` shows relative; check `dist/app_logo.png` exists.

### 3b. Scripts + CI
File: `package.json`
- Add `"typecheck": "tsc --noEmit"`, `"test": "node --test tests/"`.
- Keep zero new prod deps; use Node 22 built-in `node:test` + `node:assert/strict`.
File: `.github/workflows/deploy-pages.yml`
- Insert `- run: npm run typecheck` and `- run: npm test` between `npm ci` and `npm run build`.

### 3c. Tests (new `tests/` dir, ESM `.test.mjs` importing from `src/` via `tsx`? No — pure logic duplicated in JS to avoid TS loader)
Decision: write tests in TypeScript-compiled JS? Simpler: use `node --test` with plain `.mjs` that imports compiled output? Avoid loader complexity:
- Option chosen: `tests/schema.test.mjs` + `tests/engine-dedup.test.mjs` that inline-import via `npx tsc` compiled temp? No.
- Final: use minimal TS test files + `typescript` to typecheck them, run via `node --experimental-strip-types` (Node 22.6+ supports type-stripping). Repo engines `node>=22`, CI uses Node 22. Type-stripping is stable enough for pure-logic tests with no enums/namespaces.
- Files: `tests/schema.test.ts`, `tests/dedup.test.ts`, `tests/select.test.ts` (mock `localStorage`/`keyStore` minimal).
- If strip-types proves flaky in CI, fallback: rename to `.mjs` with JSDoc types.

### 3d. Puter hardening (no code or 2-line)
- `main.ts:333 checkPuter()` already handles blocked CDN via `isLoaded()`. Only change: ensure `puterBadge` shows `off` state text already present. No logic change unless manual test shows unhandled rejection.

## 4. Error handling

- Engine retry (3 attempts) + cache fallback in `engine.ts:41-54` unchanged.
- `explainError()` mapping in `main.ts:446` unchanged.
- New tests assert: duplicate options rejected, correctIndex bounds, short question rejected, Jaccard `tooSimilar` paraphrase caught, empty chain error message.

## 5. Testing & Acceptance

- `npm run typecheck` passes.
- `npm test` passes (≥15 assertions).
- `npm run build` passes, `dist/` contains `index.html`, `assets/`, `icons/`, `manifest.webmanifest`, `sw.js`, `app_logo.png`.
- Manual: load `dist/` via `vite preview`, block `js.puter.com` in devtools, badge shows offline state, no uncaught exception.
- PWA: `CACHE` bump to `v8` only if shell files changed (index.html changed → bump).

## 6. Risks

- Node type-stripping for tests: mitigate with fallback to plain `.mjs`.
- `sw.js` stale cache on Pages: mitigate with CACHE bump + note in DEPLOY.md.

## Self-review
- No TBDs. Scope is single plan (1 PR). No contradictions with relative-base deploy. No ambiguous requirements: all files + commands explicit.
