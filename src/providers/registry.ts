/** Single source of truth for remote providers + models. Order = dropdown order = Auto priority. */
export type ByokId = "gemini" | "groq" | "cerebras" | "openrouter" | "cline";

export interface ByokInfo { id: ByokId; name: string; model: string; portalName: string; portalUrl: string; keyPrefix: string; steps: string; }

export const BYOK: Record<ByokId, ByokInfo> = {
  gemini: {
    id: "gemini", name: "Gemini", model: "gemini-2.5-flash",
    portalName: "Google AI Studio", portalUrl: "https://aistudio.google.com/apikey", keyPrefix: "AIza...",
    steps: "Sign in with your Google account → “Create API key” → copy it. Free tier, no card needed.",
  },
  groq: {
    id: "groq", name: "Groq", model: "llama-3.3-70b-versatile",
    portalName: "Groq Console", portalUrl: "https://console.groq.com/keys", keyPrefix: "gsk_...",
    steps: "Sign in (Google/GitHub/email) → “Create API Key” → copy it. Free tier, very fast.",
  },
  cerebras: {
    id: "cerebras", name: "Cerebras", model: "qwen-3-32b",
    portalName: "Cerebras Cloud", portalUrl: "https://cloud.cerebras.ai/", keyPrefix: "csk-...",
    steps: "Sign in → API Keys → “Create key” → copy it. Free tier: ~1M tokens/day, extremely fast Qwen 3.",
  },
  openrouter: {
    id: "openrouter", name: "OpenRouter", model: "qwen/qwen3-235b-a22b:free",
    portalName: "OpenRouter", portalUrl: "https://openrouter.ai/settings/keys", keyPrefix: "sk-or-v1-...",
    steps: "Sign in → “Create Key” → copy it. Free Qwen 3 model by default (≈50 requests/day without credits).",
  },
  cline: {
    id: "cline", name: "Cline", model: "cline-pass/glm-5.3",
    portalName: "Cline API Keys", portalUrl: "https://app.cline.bot/settings/api-keys", keyPrefix: "cline_...",
    steps: "Sign in at app.cline.bot → Settings → API Keys → “Create API Key” → copy it. One key works for every cline-pass/* model (shared quota).",
  },
};

export const BYOK_IDS = Object.keys(BYOK) as ByokId[];
export const isByokId = (s: string): s is ByokId => s in BYOK;
export const portalDomain = (i: ByokInfo) => i.portalUrl.replace(/^https?:\/\//, "").split("/")[0];
export const quickLabel = (i: ByokInfo) => `${i.name} · ${i.model}`;
export const settingsLabel = (i: ByokInfo) => `${i.name} (${portalDomain(i)}) — free tier · model: ${i.model}`;
export const providerLabel = (i: ByokInfo) => `${i.name} · ${i.model} (your key)`;
