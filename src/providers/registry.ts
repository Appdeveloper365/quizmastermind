/** Single source of truth for remote providers + models. Order = dropdown order = Auto priority. */
export type ByokId = "gemini" | "groq" | "openrouter" | "nvidia" | "xai";

export interface ByokInfo { id: ByokId; name: string; model: string; portalName: string; portalUrl: string; keyPrefix: string; steps: string; }

export const BYOK: Record<ByokId, ByokInfo> = {
  gemini: {
    id: "gemini", name: "Gemini", model: "gemini-2.5-flash",
    portalName: "Google AI Studio", portalUrl: "https://aistudio.google.com/", keyPrefix: "AIza...",
    steps: "Sign in with your Google account → “Create API key” → copy it. Free tier, no card needed.",
  },
  groq: {
    id: "groq", name: "Groq", model: "llama-3.3-70b-versatile",
    portalName: "Groq Console", portalUrl: "https://console.groq.com/keys", keyPrefix: "gsk_...",
    steps: "Sign in (Google/GitHub/email) → “Create API Key” → copy it. Free tier, very fast.",
  },
  nvidia: {
    id: "nvidia", name: "NVIDIA NIM", model: "meta/llama-3.3-70b-instruct",
    portalName: "NVIDIA Build", portalUrl: "https://build.nvidia.com/settings/api-keys", keyPrefix: "nvapi-...",
    steps: "Free credits from build.nvidia.com. NVIDIA blocks direct browser calls (CORS), so also deploy the free pass-through worker once (README → “NVIDIA proxy setup”) and paste its URL in step 1b.",
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
