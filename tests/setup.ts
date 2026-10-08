// Runs before test file imports (vitest setupFiles) — app modules read
// DOM globals like localStorage/location at import time in Node.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as any).location = (globalThis as any).location ?? { origin: "http://localhost" };
