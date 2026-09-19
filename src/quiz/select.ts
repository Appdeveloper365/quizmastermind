import { ProviderError, type QuizProvider } from "../providers/types";
import { GeminiProvider } from "../providers/gemini";
import { OpenAICompatibleProvider, GROQ_CFG, CEREBRAS_CFG, OPENROUTER_CFG } from "../providers/openai-compatible";
import { PuterProvider } from "../providers/puter";
import { makeClineProvider, loadClineModel, loadClineEndpoint } from "../providers/cline";
import { BYOK_IDS, isByokId, type ByokId } from "../providers/registry";
import { keyStore } from "../storage/keys";

export type ProviderChoice = "auto" | ByokId | "puter";
export interface SelectDeps {
  askPin: (providerId: string) => Promise<string>;
  /** False when Puter.js isn't loaded / the user isn't signed in — Auto then skips Puter. */
  puterReady: boolean;
}

function makeByok(id: ByokId, key: string): QuizProvider {
  switch (id) {
    case "gemini":     return new GeminiProvider(key);
    case "groq":       return new OpenAICompatibleProvider(key, GROQ_CFG);
    case "cerebras":   return new OpenAICompatibleProvider(key, CEREBRAS_CFG);
    case "openrouter": return new OpenAICompatibleProvider(key, OPENROUTER_CFG);
    case "cline":      return makeClineProvider(key, loadClineModel(), loadClineEndpoint());
  }
}

/** Builds a provider from a raw key — used by the "Test connection" button (bypasses the PIN store). */
export function makeByokFor(id: ByokId, key: string): QuizProvider {
  return makeByok(id, key);
}

export async function selectProvider(choice: ProviderChoice, deps: SelectDeps): Promise<QuizProvider | null> {
  const byok = async (id: ByokId) => {
    if (!(await keyStore.has(id))) throw new ProviderError("auth", `No ${id} key saved. Open "AI settings" → Use my API key.`);
    return makeByok(id, await keyStore.load(id, await deps.askPin(id)));
  };
  const puter = () => {
    if (!deps.puterReady) throw new ProviderError("auth", "Not signed in to Puter. Open AI settings → Puter and press “Sign in with Puter”.");
    return new PuterProvider();
  };

  if (isByokId(choice)) return byok(choice);
  if (choice === "puter") return puter();

  // AUTO: first saved key (registry order) → Puter, if the user is already signed in.
  for (const id of BYOK_IDS) if (await keyStore.has(id)) return byok(id);
  if (deps.puterReady) return puter();
  return null;
}
