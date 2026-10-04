import { QUIZ_JSON_SCHEMA, QUIZ_GEMINI_SCHEMA } from "../quiz/schema";
import { SYSTEM_PROMPT, buildUserPrompt, type GenerateParams } from "../quiz/prompt";
import { ProviderError, mapHttpError, safeParse, shapeHint, stripFences, stripThink, type ChatOpts, type JsonSchemas, type QuizProvider } from "./types";

export type LocalKind = "ollama" | "lmstudio";
export interface LocalServer { kind: LocalKind; label: string; base: string; modelsUrl: string; chatUrl: string; }

/**
 * Local model runtimes that expose an OpenAI-compatible API on localhost.
 * Ollama also serves /api/tags (native) and /v1/models; LM Studio serves /v1/models.
 */
export const LOCAL_SERVERS: LocalServer[] = [
  { kind: "ollama",   label: "Ollama",    base: "http://localhost:11434", modelsUrl: "http://localhost:11434/v1/models", chatUrl: "http://localhost:11434/v1/chat/completions" },
  { kind: "lmstudio", label: "LM Studio", base: "http://localhost:1234",  modelsUrl: "http://localhost:1234/v1/models",  chatUrl: "http://localhost:1234/v1/chat/completions" },
];

export interface LocalModel { server: LocalServer; model: string; }

/** Probe every known localhost runtime and list the models it has installed. Never throws. */
export async function detectLocalModels(timeoutMs = 1500): Promise<LocalModel[]> {
  const out: LocalModel[] = [];
  await Promise.all(LOCAL_SERVERS.map(async (server) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(server.modelsUrl, { signal: ctl.signal });
      if (!res.ok) return;
      const data: any = await res.json().catch(() => null);
      const ids: unknown[] = Array.isArray(data?.data) ? data.data : [];
      for (const m of ids) {
        const id = typeof m === "string" ? m : (m as any)?.id;
        if (typeof id === "string" && id.trim()) out.push({ server, model: id.trim() });
      }
    } catch { /* server not running / blocked */ }
    finally { clearTimeout(t); }
  }));
  return out;
}

export interface LocalConfig { server: LocalServer; model: string; }
const LOCAL_KEY = "quiz.local";

export function loadLocalConfig(): LocalConfig | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const server = LOCAL_SERVERS.find((s) => s.kind === p.kind);
    return server && typeof p.model === "string" && p.model ? { server, model: p.model } : null;
  } catch { return null; }
}
export function saveLocalConfig(cfg: LocalConfig): void { try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ kind: cfg.server.kind, model: cfg.model })); } catch { /* storage unavailable */ } }
export function clearLocalConfig(): void { try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ } }

/** OpenAI-compatible provider pointed at a local runtime — no API key, no CORS proxy needed. */
export class LocalProvider implements QuizProvider {
  readonly id = "local" as const;
  readonly label: string;
  constructor(private cfg: LocalConfig) { this.label = `${cfg.server.label} · ${cfg.model} (local)`; }

  async generateRaw(p: GenerateParams): Promise<unknown> {
    return this.chatJSON(SYSTEM_PROMPT, buildUserPrompt(p), { strict: QUIZ_JSON_SCHEMA, gemini: QUIZ_GEMINI_SCHEMA, name: "quiz_question" }, { temperature: 1.0, maxTokens: 1500, signal: p.signal });
  }

  async chatJSON(system: string, user: string, schemas: JsonSchemas, opts: ChatOpts = {}): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(this.cfg.server.chatUrl, {
        method: "POST", signal: opts.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.cfg.model, temperature: opts.temperature ?? 0.8, max_tokens: opts.maxTokens ?? 1500,
          messages: [
            { role: "system", content: system + shapeHint(schemas.strict) },
            { role: "user", content: user },
          ],
        }),
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ProviderError("network", `Couldn't reach ${this.cfg.server.label} at ${this.cfg.server.base} — is it running? Start it, pull a model, then press “🔄 Detect local models”. ${(e as Error).message}`);
    }
    if (!res.ok) throw await mapHttpError(res);
    const data = await res.json().catch(() => null);
    if (!data) throw new ProviderError("unknown", `${this.cfg.server.label} returned a non-JSON response.`);
    const choice = data.choices?.[0];
    if (!choice) throw new ProviderError("unknown", `No choices in response from ${this.cfg.server.label}.`);
    if (choice.finish_reason === "length") throw new ProviderError("truncated", "The local model ran out of output tokens. Try an easier difficulty or a bigger model.");
    const content = choice.message?.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c.text ?? "").join("") : "";
    if (!text.trim()) throw new ProviderError("truncated", `${this.cfg.server.label} returned an empty message (the model may still be 'thinking').`);
    return safeParse(stripFences(stripThink(text)));
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
