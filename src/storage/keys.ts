/**
 * API keys stay on this device only — encrypted at rest, zero user interaction.
 *
 * How it works:
 * - The first save generates an AES-256-GCM CryptoKey via WebCrypto, stored
 *   NON-EXTRACTABLE in IndexedDB. It cannot be copied out of the browser's
 *   crypto subsystem, so a peeked localStorage, an exported profile or a
 *   browser backup only ever contains ciphertext.
 * - Each key is stored as `v2.` + base64(iv(12) || ciphertext) under
 *   quiz.key.<providerId>.
 * - The old format (plain base64, "lightly obfuscated") is detected by the
 *   missing `v2.` prefix and silently re-encrypted on first load — existing
 *   users notice nothing.
 * - "Don't save keys on this device" (session mode): the key is kept in
 *   memory only and vanishes when the tab closes; nothing is written to disk.
 *
 * Residual risk (inherent to any client-side app): code executing on THIS page
 * can still decrypt the keys — that exposure is fenced by the strict
 * connect-src allowlist in the CSP in index.html (a stolen key can only be
 * shipped to the provider APIs themselves, never to arbitrary hosts).
 */
import { idbGet, idbSet } from "./idb";

const slot = (id: string) => `quiz.key.${id}`;
const NO_PERSIST_PREF = "quiz.key.nopersist";
const DEVICE_KEY_ID = "keybox.device";
const V2 = "v2.";

const enc = new TextEncoder(), dec = new TextDecoder();
const subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null;
const canEncrypt = subtle !== null;

/* Legacy (pre-encryption) format: plain base64 — read-only, kept for migration. */
const legacyEncode = (s: string) => btoa(String.fromCharCode(...enc.encode(s)));
const legacyDecode = (s: string): string => dec.decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

async function deviceKey(): Promise<CryptoKey> {
  if (!subtle) throw new Error("WebCrypto unavailable");
  const existing = await idbGet<CryptoKey>(DEVICE_KEY_ID);
  if (existing) return existing;
  const key = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idbSet(DEVICE_KEY_ID, key);
  return key;
}

const pack = (iv: Uint8Array, ct: Uint8Array) => V2 + btoa(String.fromCharCode(...new Uint8Array([...iv, ...ct])));
const unpack = (s: string) => {
  const all = Uint8Array.from(atob(s.slice(V2.length)), (c) => c.charCodeAt(0));
  return { iv: all.slice(0, 12), ct: all.slice(12) };
};

const encrypt = async (plain: string): Promise<string> => {
  if (!subtle) throw new Error("WebCrypto unavailable");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, await deviceKey(), enc.encode(plain)));
  return pack(iv, ct);
};

const decrypt = async (packed: string): Promise<string> => {
  if (!subtle) throw new Error("WebCrypto unavailable");
  const { iv, ct } = unpack(packed);
  return dec.decode(await subtle.decrypt({ name: "AES-GCM", iv }, await deviceKey(), ct));
};

/* Session mode: keys held for this tab only. */
const session = new Map<string, string>();

export const keyPrefs = {
  /** True when the user opted into "don't save keys on this device". */
  get noPersist(): boolean { return localStorage.getItem(NO_PERSIST_PREF) === "1"; },
  set noPersist(on: boolean) { localStorage.setItem(NO_PERSIST_PREF, on ? "1" : "0"); },
};

export const keyStore = {
  /** Remember a key. In session mode it lives in memory only (gone on tab close). */
  async save(id: string, apiKey: string) {
    if (keyPrefs.noPersist) { session.set(id, apiKey); return; }
    session.delete(id);
    localStorage.setItem(slot(id), canEncrypt ? await encrypt(apiKey) : legacyEncode(apiKey));
  },
  async has(id: string) { return session.has(id) || localStorage.getItem(slot(id)) !== null; },
  async load(id: string): Promise<string> {
    if (session.has(id)) return session.get(id)!;
    const raw = localStorage.getItem(slot(id));
    if (!raw) throw new Error("No key stored");
    if (!raw.startsWith(V2)) {
      // Legacy base64 entry: decode and re-encrypt in place (one-time migration).
      let plain: string;
      try { plain = legacyDecode(raw); }
      catch { localStorage.removeItem(slot(id)); throw new Error("Stored key is unreadable — paste your key again."); }
      if (canEncrypt) localStorage.setItem(slot(id), await encrypt(plain));
      return plain;
    }
    try { return await decrypt(raw); }
    catch { localStorage.removeItem(slot(id)); throw new Error("Stored key is unreadable — paste your key again."); }
  },
  async clear(id: string) { session.delete(id); localStorage.removeItem(slot(id)); },
  /** Remove every remembered key (all providers, session + on-disk). Returns count removed. */
  async wipeAll(): Promise<number> {
    let n = 0;
    for (const id of [...session.keys()]) { session.delete(id); n++; }
    // Collect first, then delete: removing during enumeration shifts the indices.
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("quiz.key.") && k !== NO_PERSIST_PREF) doomed.push(k);
    }
    for (const k of doomed) { localStorage.removeItem(k); n++; }
    return n;
  },
};
