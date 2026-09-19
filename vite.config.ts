import { defineConfig } from "vite";
// Relative base = the same build works at the repo root, on GitHub Pages subpaths
// (/quizmastermind/) AND on a custom domain — no rebuild config needed either way.
export default defineConfig({ base: "./", build: { target: "esnext" } });

