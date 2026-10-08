// DOM shims (localStorage/location) load first via tests/setup.ts — see vitest.config.ts.
import { test, expect } from "vitest";
import { providerChain, choiceName } from "../src/quiz/select";
import { keyStore } from "../src/storage/keys";
import { BYOK_IDS } from "../src/providers/registry";

test("auto with nothing configured returns empty chain", async () => {
  const chain = await providerChain("auto", { puterReady: false });
  expect(chain.length).toBe(0);
});

test("explicit byok choice comes first even without a key saved", async () => {
  const chain = await providerChain("gemini", { puterReady: false });
  expect(chain[0]?.id).toBe("gemini");
  // build() fails fast with an actionable message when no key
  await expect(chain[0].build()).rejects.toThrow(/No Gemini key saved/);
});

test("auto includes saved keys in registry order", async () => {
  await keyStore.save("groq", "gsk_test");
  await keyStore.save("gemini", "AIza_test");
  try {
    const chain = await providerChain("auto", { puterReady: false });
    const ids = chain.map((c) => c.id);
    const geminiIdx = ids.indexOf("gemini"), groqIdx = ids.indexOf("groq");
    expect(geminiIdx).toBeGreaterThanOrEqual(0);
    expect(groqIdx).toBeGreaterThanOrEqual(0);
    expect(geminiIdx).toBeLessThan(groqIdx); // registry order: gemini before groq
    expect(ids.slice(0, 2)).toEqual(BYOK_IDS.filter((id) => id === "gemini" || id === "groq"));
  } finally {
    await keyStore.clear("groq");
    await keyStore.clear("gemini");
  }
});

test("puter only enters the chain when signed in", async () => {
  const without = await providerChain("auto", { puterReady: false });
  expect(without.some((c) => c.id === "puter")).toBe(false);
  const withSignedIn = await providerChain("auto", { puterReady: true });
  expect(withSignedIn.some((c) => c.id === "puter")).toBe(true);
});

test("explicit puter choice builds puter candidate when not ready (fails at build)", async () => {
  const chain = await providerChain("puter", { puterReady: false });
  expect(chain[0]?.id).toBe("puter");
  await expect(chain[0].build()).rejects.toThrow(/Not signed in to Puter/);
});

test("choiceName labels special choices", () => {
  expect(choiceName("auto")).toBe("Auto");
  expect(choiceName("puter")).toBe("Puter");
  expect(choiceName("local")).toBe("Local AI");
  expect(choiceName("gemini")).toBe("Gemini");
});
