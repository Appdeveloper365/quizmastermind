import { describe, it, expect, beforeEach, vi } from "vitest";

/** Fresh module instance = fresh "tab" (module-level session state resets); the
 *  mocked localStorage/IndexedDB persist = same browser profile. */
async function freshKeys() {
  vi.resetModules();
  return await import("../src/storage/keys");
}

const raw = (id: string) => localStorage.getItem(`quiz.key.${id}`);
const seedLegacy = (id: string, plain: string) => localStorage.setItem(`quiz.key.${id}`, btoa(plain));

describe("keyStore — encrypted at rest", () => {
  beforeEach(() => { localStorage.clear(); });

  it("stores ciphertext only (never plaintext) and round-trips", async () => {
    const { keyStore } = await freshKeys();
    const secret = "AIzaSyC-test-key-1234567890abcdef";
    await keyStore.save("gemini", secret);
    const stored = raw("gemini");
    expect(stored).toBeTruthy();
    expect(stored!.startsWith("v2.")).toBe(true);
    expect(stored).not.toContain(secret);
    expect(atob(stored!.slice(3))).not.toContain(secret); // decoded payload is still ciphertext
    await expect(keyStore.load("gemini")).resolves.toBe(secret);
  });

  it("uses a distinct IV per save (same key → different ciphertext)", async () => {
    const { keyStore } = await freshKeys();
    await keyStore.save("gemini", "AIza-same-key-1234567890abcd");
    const first = raw("gemini")!;
    await keyStore.save("gemini", "AIza-same-key-1234567890abcd");
    expect(raw("gemini")).not.toBe(first);
    await expect(keyStore.load("gemini")).resolves.toBe("AIza-same-key-1234567890abcd");
  });

  it("silently migrates legacy base64 entries to v2 on first load", async () => {
    const { keyStore } = await freshKeys();
    const legacy = "gsk_legacy_key_0123456789";
    seedLegacy("groq", legacy);
    await expect(keyStore.load("groq")).resolves.toBe(legacy);
    expect(raw("groq")!.startsWith("v2.")).toBe(true); // re-encrypted in place
    await expect(keyStore.load("groq")).resolves.toBe(legacy); // stable on second load
  });

  it("has()/clear() behave as before; load() on empty throws", async () => {
    const { keyStore } = await freshKeys();
    await expect(keyStore.has("xai")).resolves.toBe(false);
    await keyStore.save("xai", "xai-abc1234567890");
    await expect(keyStore.has("xai")).resolves.toBe(true);
    await keyStore.clear("xai");
    await expect(keyStore.has("xai")).resolves.toBe(false);
    await expect(keyStore.load("xai")).rejects.toThrow(/No key stored/);
  });

  it("rejects corrupted ciphertext and removes the entry", async () => {
    const { keyStore } = await freshKeys();
    localStorage.setItem("quiz.key.pollinations", "v2." + btoa("garbage-not-a-real-ciphertext"));
    await expect(keyStore.load("pollinations")).rejects.toThrow(/unreadable/);
    expect(raw("pollinations")).toBeNull();
  });
});

describe("keyStore — session-only mode", () => {
  beforeEach(() => { localStorage.clear(); });

  it("noPersist keeps keys in memory only (nothing on disk)", async () => {
    const { keyStore, keyPrefs } = await freshKeys();
    keyPrefs.noPersist = true;
    await keyStore.save("gemini", "AIza-only-in-memory");
    expect(raw("gemini")).toBeNull();
    await expect(keyStore.load("gemini")).resolves.toBe("AIza-only-in-memory");
  });

  it("session keys vanish on a fresh tab while the preference persists", async () => {
    const { keyStore, keyPrefs } = await freshKeys();
    keyPrefs.noPersist = true;
    await keyStore.save("gemini", "AIza-only-in-memory");

    const fresh = await freshKeys(); // new tab: fresh module state, same profile
    expect(fresh.keyPrefs.noPersist).toBe(true); // the preference survived
    await expect(fresh.keyStore.has("gemini")).resolves.toBe(false); // the key did not
  });

  it("normal saves still persist when session mode is toggled", async () => {
    const { keyStore, keyPrefs } = await freshKeys();
    await keyStore.save("xai", "xai-persisted-1234567890");
    keyPrefs.noPersist = true;
    await keyStore.save("groq", "gsk_session-only-123456789");
    expect(raw("xai")).toMatch(/^v2\./);
    expect(raw("groq")).toBeNull();

    const fresh = await freshKeys();
    await expect(fresh.keyStore.load("xai")).resolves.toBe("xai-persisted-1234567890");
    await expect(fresh.keyStore.has("groq")).resolves.toBe(false);
  });
});

describe("keyStore — wipeAll", () => {
  beforeEach(() => { localStorage.clear(); });

  it("removes every stored key (v2 + legacy) and session entries, keeps the preference", async () => {
    const { keyStore, keyPrefs } = await freshKeys();
    await keyStore.save("gemini", "AIza-111111111111111111");
    seedLegacy("groq", "gsk_222222222222222222");
    keyPrefs.noPersist = true;
    await keyStore.save("xai", "xai-333333333333333333"); // session-only

    expect(await keyStore.wipeAll()).toBe(3);
    for (const id of ["gemini", "groq", "xai"]) {
      await expect(keyStore.has(id)).resolves.toBe(false);
      expect(raw(id)).toBeNull();
    }
    expect(keyPrefs.noPersist).toBe(true); // the opt-out itself is not a key
  });

  it("returns 0 when nothing is stored", async () => {
    const { keyStore } = await freshKeys();
    expect(await keyStore.wipeAll()).toBe(0);
  });
});
