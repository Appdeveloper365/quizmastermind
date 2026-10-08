// Runs before test file imports (vitest setupFiles) — app modules read
// DOM globals like localStorage/location at import time in Node.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as any).location = (globalThis as any).location ?? { origin: "http://localhost" };

// In-memory IndexedDB — QuizEngine.next() persists seen/cache via src/storage/idb.ts.
const kv = new Map<string, unknown>();
(globalThis as any).indexedDB = {
  open() {
    const req: any = {};
    req.result = {
      createObjectStore: () => ({}),
      transaction: () => {
        const tx: any = {
          objectStore: () => ({
            get: (k: string) => {
              const r: any = {};
              queueMicrotask(() => { r.result = kv.get(k); r.onsuccess?.(); });
              return r;
            },
            put: (v: unknown, k: string) => { kv.set(k, v); },
          }),
        };
        queueMicrotask(() => tx.oncomplete?.());
        return tx;
      },
    };
    queueMicrotask(() => { req.onupgradeneeded?.(); req.onsuccess?.(); });
    return req;
  },
};
