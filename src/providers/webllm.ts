import { QUIZ_JSON_SCHEMA, QUIZ_GEMINI_SCHEMA } from "../quiz/schema";
import { LOCAL_SYSTEM_PROMPT, buildLocalUserPrompt, type GenerateParams } from "../quiz/prompt";
import { ProviderError, shapeHint, stripFences, stripThink, safeParse, type ChatOpts, type JsonSchemas, type QuizProvider } from "./types";

/**
 * WebLLM — runs an LLM entirely in the browser via WebGPU (@mlc-ai/web-llm).
 * No API key, no account, fully offline after the one-time model download.
 * Imported lazily so the ~2MB library only loads when the user enables it.
 */

/** Compact models that run well in a browser tab (MLC model zoo IDs, all q4f16_1 for WebGPU).
 *  Llama-3.2-1B removed after side-by-side benchmark: Qwen3-0.6B was ~2.5x faster at the
 *  median (0.8s vs 2.1s) with equal or better JSON validity on this code path. */
export const WEBLLM_MODELS = [
  { id: "Qwen3-0.6B-q4f16_1-MLC", label: "Qwen 3 0.6B (fastest, ~500MB)" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 1.5B (smarter, ~1.1GB)" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B (smartest, ~1.8GB)" },
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

/** Pulls the JSON object out of model output that may include prose, code fences,
 *  or think-blocks. Tries every '{' … '}' pair — small strings, so brute force is fine. */
function extractJson(raw: string): unknown {
  const t = stripThink(stripFences(raw.trim()));
  let start = -1;
  while ((start = t.indexOf("{", start + 1)) >= 0) {
    for (let end = t.lastIndexOf("}"); end > start; end = t.lastIndexOf("}", end - 1)) {
      try { return JSON.parse(t.slice(start, end + 1)); } catch { /* try next pair */ }
    }
  }
  throw new ProviderError("truncated", "Model returned non-JSON");
}

export class WebLlmProvider implements QuizProvider {
  readonly id = "webllm" as const;
  readonly label: string;
  constructor(private model: string, private onProgress?: (pct: number, text: string) => void) {
    this.label = `In-browser · ${WEBLLM_MODELS.find((m) => m.id === model)?.label ?? model}`;
  }

  async generateRaw(p: GenerateParams): Promise<unknown> {
    // Compact prompt + lower temperature: small models validate more often on first try,
    // which is the main lever on end-to-end speed (engine retries invalid JSON up to 3x).
    return this.chatJSON(LOCAL_SYSTEM_PROMPT, buildLocalUserPrompt(p), { strict: QUIZ_JSON_SCHEMA, gemini: QUIZ_GEMINI_SCHEMA, name: "quiz_question" }, { temperature: 0.7, maxTokens: 900, signal: p.signal });
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
        // Qwen3 thinking burns the whole token budget on reasoning and never emits JSON.
        // web-llm 0.2.85 reads this ONLY from extra_body (top-level is silently ignored).
        extra_body: { enable_thinking: false },
        // No response_format: { type: "json_object" } — WebLLM's grammar matcher crashes
        // on Qwen3 tokenizers ("Cannot pass non-string to std::string"). The system prompt
        // demands JSON and extractJson handles the rest.
      });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/memory|oom|allocation|device lost/i.test(msg))
        throw new ProviderError("unsupported", `The in-browser model ran out of GPU memory — close other tabs or pick the smallest model. ${msg}`);
      throw new ProviderError("unknown", `WebLLM error: ${msg}`);
    }
    const text: string = res?.choices?.[0]?.message?.content ?? "";
    if (!String(text).trim()) throw new ProviderError("truncated", "The in-browser model returned an empty response.");
    return extractJson(String(text));
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
