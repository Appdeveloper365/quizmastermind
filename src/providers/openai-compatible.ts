import { QUIZ_JSON_SCHEMA, QUIZ_GEMINI_SCHEMA } from "../quiz/schema";
import { SYSTEM_PROMPT, buildUserPrompt, type GenerateParams } from "../quiz/prompt";
import { ProviderError, mapHttpError, safeParse, shapeHint, stripFences, stripThink, type ChatOpts, type JsonSchemas, type QuizProvider } from "./types";
import { BYOK, providerLabel, type ByokId } from "./registry";

export interface CompatConfig {
  id: ByokId; label: string; endpoint: string; model: string;
  jsonMode: "json_schema" | "json_object";
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  /** Appended to the network/CORS error to help the user self-diagnose (e.g. NVIDIA proxy). */
  networkHint?: string;
}

/** Generic OpenAI-compatible chat/completions: Groq, OpenRouter, NVIDIA NIM, xAI. */
export class OpenAICompatibleProvider implements QuizProvider {
  readonly id: ByokId; readonly label: string;
  constructor(private apiKey: string, private cfg: CompatConfig) { this.id = cfg.id; this.label = cfg.label; }

  async generateRaw(p: GenerateParams): Promise<unknown> {
    return this.chatJSON(SYSTEM_PROMPT, buildUserPrompt(p) + " /no_think", { strict: QUIZ_JSON_SCHEMA, gemini: QUIZ_GEMINI_SCHEMA, name: "quiz_question" }, { temperature: 1.0, maxTokens: 1500, signal: p.signal });
  }

  async chatJSON(system: string, user: string, schemas: JsonSchemas, opts: ChatOpts = {}): Promise<unknown> {
    const useSchema = this.cfg.jsonMode === "json_schema";
    const makeBody = (withResponseFormat: boolean): any => ({
      model: this.cfg.model, temperature: opts.temperature ?? 0.8, max_tokens: opts.maxTokens ?? 1500,
      messages: [
        // Always include the key list: schema-constrained models still produce far more reliable
        // values when told what the fields are, and non-schema providers have no other guidance.
        { role: "system", content: system + shapeHint(schemas.strict) },
        { role: "user", content: user },
      ],
      ...(withResponseFormat ? {
        response_format: useSchema
          ? { type: "json_schema", json_schema: { name: schemas.name, strict: true, schema: schemas.strict } }
          : { type: "json_object" },
      } : {}),
      ...this.cfg.extraBody,
    });
    const send = async (requestBody: any): Promise<Response> => {
      let res: Response;
      try {
        res = await fetch(this.cfg.endpoint, {
          method: "POST", signal: opts.signal,
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...this.cfg.extraHeaders },
          body: JSON.stringify(requestBody),
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        const hint = this.cfg.networkHint ? ` ${this.cfg.networkHint}` : "";
        throw new ProviderError("network", `Couldn't reach ${this.cfg.endpoint} — network, CORS or an ad-blocker.${hint} ${(e as Error).message}`);
      }
      return res;
    };

    let res = await send(true);
    // Some gateways reject strict json_schema (or json_object) outright — fall back to a bare
    // request that relies on the shape hint instead of failing the whole quiz.
    if (res.status === 400 && /response_format|json_schema|schema|json_object|strict/i.test(await res.clone().text().catch(() => ""))) {
      res = await send(false);
    }
    if (!res.ok) throw await mapHttpError(res);
    const data = await res.json().catch(() => null);
    if (!data) throw new ProviderError("unknown", `${this.label} returned a non-JSON response.`);
    const choice = data.choices?.[0];
    if (!choice) throw new ProviderError("unknown", `No choices in response from ${this.label}.`);
    if (choice.message?.refusal) throw new ProviderError("refusal", choice.message.refusal);
    if (choice.finish_reason === "length") throw new ProviderError("truncated", "The model ran out of output tokens (finish_reason=length). Try an easier difficulty.");
    const content = choice.message?.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c.text ?? "").join("") : "";
    if (!text.trim()) throw new ProviderError("truncated", `${this.label} returned an empty message (the model may still be 'thinking').`);
    return safeParse(stripFences(stripThink(text)));
  }

  /** Real round-trip: proves the key, the endpoint and the model name all work. */
  async verify(): Promise<void> {
    await this.chatJSON(
      "You are a connectivity test. Reply with JSON only.",
      'Return exactly {"ok":true}.',
      { strict: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }, gemini: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, name: "connectivity_check" },
      { temperature: 0, maxTokens: 32 },
    );
  }
}

/** App identification headers — attribute usage to the app in provider dashboards (ignored by providers that don't use them). */
const appIdentity = (): Record<string, string> => ({ "HTTP-Referer": location.origin, "X-Title": "Quiz Mastermind" });

export const GROQ_CFG: CompatConfig = {
  id: "groq", label: providerLabel(BYOK.groq),
  endpoint: "https://api.groq.com/openai/v1/chat/completions", model: BYOK.groq.model, jsonMode: "json_object",
  extraHeaders: appIdentity(),
};
/** NVIDIA blocks direct browser calls (CORS) — the app routes through the user's own Cloudflare Worker pass-through proxy (cloudflare/ in the repo). */
export const NVIDIA_PROXY_URL_KEY = "quiz.nvidiaProxy";
export const NVIDIA_UPSTREAM = "https://integrate.api.nvidia.com/v1/chat/completions";
/** Default pass-through worker (repo cloudflare/nvidia-cors-proxy.js) — preconfigured so NVIDIA works out of the box. */
export const DEFAULT_NVIDIA_PROXY = "https://quizmastermind-nvidia-proxy.gmailbox365.workers.dev";
export function loadNvidiaProxy(): string { try { return localStorage.getItem(NVIDIA_PROXY_URL_KEY)?.trim() ?? ""; } catch { return ""; } }
export function saveNvidiaProxy(url: string): void { try { localStorage.setItem(NVIDIA_PROXY_URL_KEY, url.trim()); } catch { /* storage unavailable */ } }
export const makeNvidiaCfg = (): CompatConfig => {
  const custom = loadNvidiaProxy();
  const endpoint = custom || DEFAULT_NVIDIA_PROXY || NVIDIA_UPSTREAM;
  return {
    id: "nvidia", label: providerLabel(BYOK.nvidia),
    endpoint, model: BYOK.nvidia.model, jsonMode: "json_object",
    extraHeaders: appIdentity(),
    networkHint: custom
      ? "Your custom NVIDIA proxy URL is unreachable — check it in AI settings → NVIDIA → Advanced, or redeploy the worker (cloudflare/ folder)."
      : "The shared NVIDIA proxy is currently unreachable — you can deploy your own free worker from the cloudflare/ folder (see README → NVIDIA proxy) and paste its URL in AI settings → NVIDIA → Advanced, or pick a different provider meanwhile.",
  };
};
export const XAI_CFG: CompatConfig = {
  id: "xai", label: providerLabel(BYOK.xai),
  endpoint: "https://api.x.ai/v1/chat/completions", model: BYOK.xai.model, jsonMode: "json_object",
  extraHeaders: appIdentity(),
};
export const OPENROUTER_CFG: CompatConfig = {
  id: "openrouter", label: providerLabel(BYOK.openrouter),
  endpoint: "https://openrouter.ai/api/v1/chat/completions", model: BYOK.openrouter.model, jsonMode: "json_object",
  extraHeaders: { "HTTP-Referer": location.origin, "X-Title": "Quiz Mastermind" },
  extraBody: { reasoning: { enabled: false } },   // keep Qwen 3 from spending tokens on thinking
};
