import type { GenerateParams } from "../quiz/prompt";
import type { ByokId } from "./registry";

export type ProviderErrorKind = "auth" | "quota" | "rate_limit" | "refusal" | "truncated" | "network" | "unsupported" | "unknown";

export class ProviderError extends Error {
  constructor(public kind: ProviderErrorKind, message: string, public status?: number) { super(message); this.name = "ProviderError"; }
  get isFatal() { return this.kind === "auth" || this.kind === "quota" || this.kind === "unsupported"; }
}

export interface ChatOpts { temperature?: number; maxTokens?: number; signal?: AbortSignal; }
/** strict = OpenAI-style JSON schema (additionalProperties/enum ok); gemini = OpenAPI subset (no additionalProperties/integer enum). */
export interface JsonSchemas { strict: unknown; gemini: unknown; name: string; }

export interface QuizProvider {
  readonly id: ByokId | "puter" | "local";
  readonly label: string;
  generateRaw(params: GenerateParams): Promise<unknown>;
  /** Generic structured-JSON chat call; also backs generateRaw on every provider. */
  chatJSON(system: string, user: string, schemas: JsonSchemas, opts?: ChatOpts): Promise<unknown>;
  /** Cheap live check that the credential + model actually work. Throws ProviderError on failure. */
  verify(): Promise<void>;
}

/** Builds an inline "Output ONLY a JSON object with keys: ..." hint from a JSON-schema-shaped object, for providers without native schema enforcement. */
export function shapeHint(schema: any): string {
  const props = (schema?.properties ?? {}) as Record<string, any>;
  const parts = Object.keys(props).map((k) => {
    const p = props[k];
    const t = p?.type === "array" ? `array of ${p.items?.type ?? "items"}` : p?.type ?? "any";
    return `${k} (${t})`;
  });
  return ` Output ONLY a single JSON object with keys: ${parts.join(", ")}. No markdown, no prose.`;
}

export async function mapHttpError(res: Response): Promise<ProviderError> {
  // Providers disagree on error shape:
  //   OpenAI/Groq/OpenRouter/NVIDIA/xAI : { error: { message, type, code } }
  //   Gemini                            : { error: { code, message, status } }
  const raw = await res.text().catch(() => "");
  let body: any = null;
  try { body = JSON.parse(raw); } catch { /* non-JSON (HTML/plain text) */ }
  const errField = body?.error;
  const msg: string = (
    (errField && typeof errField === "object" ? errField.message : undefined) ??
    (typeof errField === "string" ? errField : undefined) ??
    body?.message ??
    body?.detail ??
    errField?.status ??
    (raw && raw.length < 300 && !raw.trimStart().startsWith("<") ? raw.trim() : "") ??
    res.statusText
  ) || res.statusText;
  const code = String(body?.error?.code ?? body?.code ?? body?.error?.type ?? body?.type ?? "");
  const haystack = (code + " " + msg).toLowerCase();

  if (res.status === 401 || res.status === 403)
    return new ProviderError("auth", `Invalid or unauthorized API key: ${msg}`, res.status);
  if (res.status === 404 && /model|not found|does not exist/i.test(haystack))
    return new ProviderError("unsupported", `Model not available on this account: ${msg}`, res.status);
  if (res.status === 400 && /model|not found|does not exist|unsupported/i.test(haystack))
    return new ProviderError("unsupported", `Model rejected: ${msg}`, res.status);
  if (res.status === 402)
    return new ProviderError("quota", `Payment required: ${msg}`, 402);
  if (res.status === 429) {
    return /quota|billing|resource_exhausted|insufficient|daily|credit|exceeded/i.test(haystack)
      ? new ProviderError("quota", `Out of credits/quota: ${msg}`, 429)
      : new ProviderError("rate_limit", `Rate limited (free tiers have per-minute caps — wait a moment): ${msg}`, 429);
  }
  if (res.status === 413 || /context|too long|token/i.test(haystack) && /exceed|limit/i.test(haystack))
    return new ProviderError("truncated", `Request too large: ${msg}`, res.status);
  return new ProviderError("unknown", `HTTP ${res.status}: ${msg}`, res.status);
}

/** Fires a tiny real request so the UI can prove the key + model actually work before a quiz starts. */
export async function preflight(path: string, init: RequestInit): Promise<{ ok: true } | { ok: false; error: ProviderError }> {
  try {
    const res = await fetch(path, init);
    if (res.ok) return { ok: true };
    return { ok: false, error: await mapHttpError(res) };
  } catch (e) {
    return { ok: false, error: new ProviderError("network", `Network/CORS failure: ${(e as Error).message}`) };
  }
}

export function safeParse(text: string): unknown { try { return JSON.parse(text); } catch { throw new ProviderError("truncated", "Model returned non-JSON"); } }
export function stripFences(s: string): string { return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim(); }
/** Qwen 3 may emit </think> before the JSON; drop it. */
export function stripThink(s: string): string { return s.replace(/<think>[\s\S]*?<\/think>/g, "").trim(); }
