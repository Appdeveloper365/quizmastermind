import { OpenAICompatibleProvider, type CompatConfig } from "./openai-compatible";
import { BYOK, providerLabel } from "./registry";

/**
 * Cline API — https://api.cline.bot/api/v1 (OpenAI-compatible: POST /chat/completions,
 * `Authorization: Bearer <key>`). One key from app.cline.bot → Settings → API Keys works for
 * every cline-pass/* model, since that quota is shared across them. Free models are also
 * available (e.g. minimax/minimax-m2.5) on a separate free allowance.
 */
export const CLINE_MODELS = [
  { id: "cline-pass/glm-5.3", note: "best reasoning" },
  { id: "cline-pass/kimi-k3", note: "best long-horizon" },
  { id: "cline-pass/qwen3.8-max", note: "complex coding" },
  { id: "cline-pass/minimax-m3", note: "best balance / fastest" },
  { id: "cline-pass/deepseek-v4-pro", note: "strong all-rounder" },
  { id: "minimax/minimax-m2.5", note: "free promo model (separate quota)" },
];

export const CLINE_ENDPOINT = "https://api.cline.bot/api/v1/chat/completions";

/** Chat-completions endpoint for the Cline API. Overridable for self-hosted/proxy setups. */
export function clineEndpoint(custom?: string | null): string {
  const base = (custom && custom.trim()) || "https://api.cline.bot/api/v1";
  return base.replace(/\/+$/, "") + "/chat/completions";
}

export function makeClineConfig(model: string, endpoint?: string | null): CompatConfig {
  return {
    id: "cline",
    label: `${providerLabel(BYOK.cline)}${model ? " · " + model : ""}`,
    endpoint: clineEndpoint(endpoint),
    model,
    // Cline's gateway is OpenAI-shaped; json_object is the safe common denominator across
    // the cline-pass models (they're reasoning models and honour the shape hint).
    jsonMode: "json_object",
  };
}

export function makeClineProvider(apiKey: string, model: string, endpoint?: string | null) {
  return new OpenAICompatibleProvider(apiKey, makeClineConfig(model, endpoint));
}

export const CLINE_DEFAULT_MODEL = BYOK.cline.model;
export const CLINE_CUSTOM_LS = "quiz.cline.endpoint";
export const CLINE_MODEL_LS = "quiz.cline.model";
export const loadClineModel = (): string => localStorage.getItem(CLINE_MODEL_LS) || CLINE_DEFAULT_MODEL;
export const saveClineModel = (m: string) => localStorage.setItem(CLINE_MODEL_LS, m);
export const loadClineEndpoint = (): string => localStorage.getItem(CLINE_CUSTOM_LS) || "";
export const saveClineEndpoint = (v: string) => localStorage.setItem(CLINE_CUSTOM_LS, v);