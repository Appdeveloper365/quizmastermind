import { defineConfig } from "vite";
// Relative base = the same build works at the repo root, on GitHub Pages subpaths
// (/quizmastermind/) AND on a custom domain — no rebuild config needed either way.
// web-llm is a ~6MB lazy chunk (only fetched when in-browser AI is enabled) — expected.
export default defineConfig({ base: "./", build: { target: "esnext", chunkSizeWarningLimit: 7000 } });

