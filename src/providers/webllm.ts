import { QUIZ_JSON_SCHEMA, QUIZ_GEMINI_SCHEMA } from "../quiz/schema";
import { SYSTEM_PROMPT, buildUserPrompt, type GenerateParams } from "../quiz/prompt";
import { ProviderError, shapeHint, stripFences, stripThink, safeParse, type ChatOpts, type JsonSchemas, type QuizProvider } from "./types";

/**
 * WebLLM — runs an LLM entirely in the browser via WebGPU (@mlc-ai/web-llm).
 * No API key, no account, fully offline after the one-time model download.
 * Imported lazily so the ~2MB library only loads when the user enables it.
 */

/** Compact models that run well in a browser tab (MLC model zoo IDs). */
export const WEBLLM_MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B (fastest, ~700MB)" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B (smarter, ~1.8GB)" },
  { id: "Qwen3-1.7B-q4f16_1-MLC", label: "Qwen 3 1.7B (~1.1GB)" },
] as const;
export const DEFAULT_WEBLLM_MODEL = WEBLLM_MODELS[0].id;

const WEBLLM_KEY = "quiz.webllm";
export function loadWebllmModel(): string | null { try { return localStorage.getItem(WEBLLM_KEY); } catch { return null; } }
export function saveWebllmModel(id: string): void { try { localStorage.setItem(WEBLLM_KEY, id); } catch { /* ignore */ } }
export function clearWebllmModel(): void { try { localStorage.removeItem(WEBLLM_KEY); } catch { /* ignore */ } }

export const webGpuSupported = (): boolean => typeof navigator !== "undefined" && "gpu" in navigator;

let enginePromise: Promise<any> | null = null;
let engineModel = "";

async function getEngine(model: string, onProgress?: (pct: number, text: string) => void): Promise<any> {
  if (enginePromise && engineModel === model) return enginePromise;
  enginePromise = (async () => {
    if (!webGpuSupported())
      throw new ProviderError("unsupported", "This browser has no WebGPU — use Chrome or Edge (desktop or recent Android), or pick Ollama / LM Studio above instead.");
    const webllm = await import("@mlc-ai/web-llm");
    return webllm.CreateMLCEngine(model, {
      initProgressCallback: (r: any) => {
        const pct = typeof r?.progress === "number" ? Math.round(r.progress * 100) : 0;
        onProgress?.(pct, String(r?.text ?? "Loading model…"));
      },
    });
  })();
  engineModel = model;
  enginePromise.catch(() => { enginePromise = null; engineModel = ""; }); // allow retry after failure
  return enginePromise;
}

export class WebLlmProvider implements QuizProvider {
  readonly id = "webllm" as const;
  readonly label: string;
  constructor(private model: string, private onProgress?: (pct: number, text: string) => void) {
    this.label = `In-browser · ${WEBLLM_MODELS.find((m) => m.id === model)?.label ?? model}`;
  }

  async generateRaw(p: GenerateParams): Promise<unknown> {
    return this.chatJSON(SYSTEM_PROMPT, buildUserPrompt(p), { strict: QUIZ_JSON_SCHEMA, gemini: QUIZ_GEMINI_SCHEMA, name: "quiz_question" }, { temperature: 1.0, maxTokens: 1500, signal: p.signal });
  }

  async chatJSON(system: string, user: string, schemas: JsonSchemas, opts: ChatOpts = {}): Promise<unknown> {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const engine = await getEngine(this.model, this.onProgress);
    let res: any;
    try {
      res = await engine.chat.completions.create({
        messages: [
          { role: "system", content: system + shapeHint(schemas.strict) },
          { role: "user", content: user },
        ],
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 1500,
        response_format: { type: "json_object" },
      });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/memory|oom|allocation|device lost/i.test(msg))
        throw new ProviderError("unsupported", `The in-browser model ran out of GPU memory — close other tabs or pick the smallest model. ${msg}`);
      throw new ProviderError("unknown", `WebLLM error: ${msg}`);
    }
    const text: string = res?.choices?.[0]?.message?.content ?? "";
    if (!String(text).trim()) throw new ProviderError("truncated", "The in-browser model returned an empty response.");
    return safeParse(stripFences(stripThink(String(text))));
  }

  async verify(): Promise<void> {
    await this.chatJSON(
      "You are a connectivity test. Reply with JSON only.",
      'Return exactly {"ok":true}.',
      { strict: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }, gemini: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, name: "connectivity_check" },
      { temperature: 0, maxTokens: 32 },
    );
  }
}
