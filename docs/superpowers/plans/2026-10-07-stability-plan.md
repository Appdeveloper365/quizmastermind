# Stability Hardening — Implementation Plan

Date: 2026-10-07
Spec: docs/superpowers/specs/2026-10-07-stability-design.md
Execution: task-by-task, verify after each, stop on unexpected file changes.

## Task 1: Fix logo asset path
- `index.html:94`: `src="/app_logo.png?v=2"` → `src="./app_logo.png?v=2"`.
- Verify: `grep -n 'app_logo' index.html` shows relative path.

## Task 2: Add scripts
- `package.json` scripts: add `"typecheck": "tsc --noEmit"` and `"test": "node --test --experimental-strip-types tests/"`.
- Verify: `npm run typecheck` passes.

## Task 3: Tests
- `tests/schema.test.ts`: validateQuizQuestion (good + each rejection), shuffleOptions invariants, normalizeQuestion.
- `tests/dedup.test.ts`: tooSimilar paraphrase (export from engine or replicate Jaccard helper — test via `isDupe` behavior through a fake provider, or export `tooSimilar` for testability).
- `tests/select.test.ts`: providerChain ordering with mock localStorage + keyStore.
- Verify: `npm test` passes.

## Task 4: CI wiring
- `.github/workflows/deploy-pages.yml`: add typecheck + test steps after `npm ci`.
- Verify: YAML valid (indentation check via grep).

## Task 5: PWA cache bump
- `public/sw.js`: `CACHE = "quiz-mastermind-v8"` (index.html changed).

## Task 6: Final verification
- `npm run typecheck && npm test && npm run build`.
- `ls dist/` shows expected assets.
- Commit.
