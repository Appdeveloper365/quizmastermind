/** API keys kept on this device only (localStorage, lightly obfuscated — no lock PIN needed). */
const slot = (id: string) => `quiz.key.${id}`;
const enc = new TextEncoder(), dec = new TextDecoder();
const obfuscate = (s: string) => btoa(String.fromCharCode(...enc.encode(s)));
const deobfuscate = (s: string) => dec.decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

export const keyStore = {
  async save(id: string, apiKey: string) {
    localStorage.setItem(slot(id), obfuscate(apiKey));
  },
  async has(id: string) { return localStorage.getItem(slot(id)) !== null; },
  async load(id: string) {
    const raw = localStorage.getItem(slot(id)); if (!raw) throw new Error("No key stored");
    try { return deobfuscate(raw); }
    catch { localStorage.removeItem(slot(id)); throw new Error("Stored key is unreadable (saved with the old PIN system) — paste your key again."); }
  },
  async clear(id: string) { localStorage.removeItem(slot(id)); },
};
