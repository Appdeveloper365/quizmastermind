import { ProviderError, type QuizProvider } from "../providers/types";
import { GeminiProvider } from "../providers/gemini";
import { OpenAICompatibleProvider, GROQ_CFG, OPENROUTER_CFG, POLLINATIONS_CFG, XAI_CFG } from "../providers/openai-compatible";
import { LocalProvider, loadLocalConfig } from "../providers/local";
import { PuterProvider } from "../providers/puter";
import { BYOK, BYOK_IDS, isByokId, type ByokId } from "../providers/registry";
import { keyStore } from "../storage/keys";

export type ProviderChoice = "auto" | ByokId | "puter" | "local";
export interface SelectDeps {
  /** False when Puter.js isn't loaded / the user isn't signed in — Auto then skips Puter. */
  puterReady: boolean;
}

function makeByok(id: ByokId, key: string): QuizProvider {
  switch (id) {
    case "gemini":       return new GeminiProvider(key);
    case "groq":         return new OpenAICompatibleProvider(key, GROQ_CFG);
    case "openrouter":   return new OpenAICompatibleProvider(key, OPENROUTER_CFG);
    case "pollinations": return new OpenAICompatibleProvider(key, POLLINATIONS_CFG);
    case "xai":          return new OpenAICompatibleProvider(key, XAI_CFG);
  }
}

/** Builds a provider from a raw key — used by the "Test connection" button. */
export function makeByokFor(id: ByokId, key: string): QuizProvider {
  return makeByok(id, key);
}

/** Display name for menus (Puter/Local/Auto are special — not in the BYOK registry). */
export const choiceName = (id: ProviderChoice): string =>
  id === "puter" ? "Puter" : id === "local" ? "Local AI" : id === "auto" ? "Auto" : (BYOK[id]?.name ?? id);

export interface ProviderCandidate { id: ProviderChoice; build: () => Promise<QuizProvider>; }

/**
 * Agent-style ordered candidate list for a generation attempt.
 * Explicit choice first, then every other saved key, then local, then Puter (if signed in).
 * Each build() resolves key + provider at call time so the chain always reflects the latest state.
 */
export async function providerChain(choice: ProviderChoice, deps: SelectDeps): Promise<ProviderCandidate[]> {
  const chain: ProviderCandidate[] = [];
  const pushByok = (id: ByokId) => chain.push({
    id, build: async () => {
      if (!(await keyStore.has(id))) throw new ProviderError("auth", `No ${BYOK[id].name} key saved. Open "AI settings" → Use my API key.`);
      return makeByok(id, await keyStore.load(id));
    },
  });
  const pushPuter = () => chain.push({
    id: "puter", build: async () => {
      if (!deps.puterReady) throw new ProviderError("auth", "Not signed in to Puter. Open AI settings → Puter and press “Sign in with Puter”.");
      return new PuterProvider();
    },
  });
  const pushLocal = () => chain.push({
    id: "local", build: async () => {
      const cfg = loadLocalConfig();
      if (!cfg) throw new ProviderError("unsupported", "No local model selected. Open AI settings → 💻 Local AI and press “🔄 Detect local models”.");
      return new LocalProvider(cfg);
    },
  });
  // Explicit choice first — the single selection is the single source of truth.
  if (isByokId(choice)) pushByok(choice);
  else if (choice === "puter") pushPuter();
  else if (choice === "local") pushLocal();
  // Auto: every saved key in registry order, then local, then Puter.
  for (const id of BYOK_IDS) if (!chain.some((c) => c.id === id) && await keyStore.has(id)) pushByok(id);
  if (!chain.some((c) => c.id === "local") && loadLocalConfig()) pushLocal();
  if (deps.puterReady && !chain.some((c) => c.id === "puter")) pushPuter();
  return chain;
}
