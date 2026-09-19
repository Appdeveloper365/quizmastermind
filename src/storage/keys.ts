/** PIN-encrypted API keys (PBKDF2 → AES-GCM); only ciphertext in localStorage. */
const slot = (id: string) => `quiz.key.${id}`;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function deriveKey(pin: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: 250_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export const keyStore = {
  async save(id: string, apiKey: string, pin: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deriveKey(pin, salt), enc.encode(apiKey)));
    localStorage.setItem(slot(id), JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
  },
  async has(id: string) { return localStorage.getItem(slot(id)) !== null; },
  async load(id: string, pin: string) {
    const raw = localStorage.getItem(slot(id)); if (!raw) throw new Error("No key stored");
    const { salt, iv, ct } = JSON.parse(raw);
    try { return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await deriveKey(pin, unb64(salt)), unb64(ct))); }
    catch { throw new Error("Wrong PIN. Clear the key in settings and save it again with a new PIN."); }
  },
  async clear(id: string) { localStorage.removeItem(slot(id)); },
};
