/** Single source of truth for remote providers + models. Order = dropdown order = Auto priority. */
export type ByokId = "gemini" | "groq" | "openrouter" | "pollinations" | "xai";

export interface ByokInfo { id: ByokId; name: string; model: string; portalName: string; portalUrl: string; keyPrefix: string; steps: string; }

export const BYOK: Record<ByokId, ByokInfo> = {
  gemini: {
    id: "gemini", name: "Gemini", model: "gemini-3.6-flash",
    portalName: "Google AI Studio", portalUrl: "https://aistudio.google.com/", keyPrefix: "AIza...",
    steps: "Sign in with your Google account → “Create API key” → copy it. Free tier, no card needed.",
  },
  groq: {
    id: "groq", name: "Groq", model: "llama-3.3-70b-versatile",
    portalName: "Groq Console", portalUrl: "https://console.groq.com/keys", keyPrefix: "gsk_...",
    steps: "Sign in (Google/GitHub/email) → “Create API Key” → copy it. Free tier, very fast.",
  },
  pollinations: {
    id: "pollinations", name: "Pollinations", model: "openai/gpt-5.4-nano",
    portalName: "Pollinations", portalUrl: "https://enter.pollinations.ai/keys", keyPrefix: "sk_...",
    steps: "Sign in at enter.pollinations.ai (GitHub/Google) → create a key → copy it. Free pollen included, no card. One key routes to many models.",
  },
  openrouter: {
    id: "openrouter", name: "OpenRouter", model: "qwen/qwen3-235b-a22b:free",
    portalName: "OpenRouter", portalUrl: "https://openrouter.ai/workspaces/default/keys", keyPrefix: "sk-or-v1-...",
    steps: "Sign in → “Create Key” → copy it. Hundreds of models — free ones included.",
  },
  xai: {
    id: "xai", name: "xAI", model: "grok-4.6",
    portalName: "xAI Console", portalUrl: "https://console.x.ai/", keyPrefix: "xai-...",
    steps: "Sign in → API Keys → “Create API key” → copy it. (xAI is paid — needs credits.)",
  },
};

export const BYOK_IDS = Object.keys(BYOK) as ByokId[];
export const isByokId = (s: string): s is ByokId => s in BYOK;
export const portalDomain = (i: ByokInfo) => i.portalUrl.replace(/^https?:\/\//, "").split("/")[0];
/** Labels intentionally show only provider names — no specific model ids in the UI. */
export const quickLabel = (i: ByokInfo) => i.name;
export const settingsLabel = (i: ByokInfo) => `${i.name} (${portalDomain(i)})`;
export const providerLabel = (i: ByokInfo) => `${i.name} (your key)`;

/** One-stop shop listing many free-tier API providers in one place. */
export const FREE_KEY_PORTAL = { name: "freellm.net", url: "https://freellm.net/" };
