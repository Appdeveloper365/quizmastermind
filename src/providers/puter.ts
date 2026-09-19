import { QUIZ_JSON_SCHEMA, QUIZ_GEMINI_SCHEMA } from "../quiz/schema";
import { SYSTEM_PROMPT, buildUserPrompt, type GenerateParams } from "../quiz/prompt";
import { ProviderError, safeParse, shapeHint, stripThink, type ChatOpts, type JsonSchemas, type QuizProvider } from "./types";

declare global {
  interface Window { puter?: any }
}

/**
 * Puter.js — free cloud AI through the user's own Puter account ("user-pays": the user covers
 * their own usage, the developer pays nothing and manages no API keys).
 * No model is selected: Puter routes/chooses the model automatically on their end.
 * The only thing that matters here is that Puter *recognizes the connection* — the SDK is
 * loaded and the session is authenticated. If the user isn't signed in yet, Puter's own
 * sign-in popup appears on the first AI call, so we don't hard-block on it.
 * Loaded from the CDN in index.html (https://js.puter.com/v2/).
 */

export class PuterProvider implements QuizProvider {
  readonly id = "puter" as const;
  readonly label = "Puter · auto model (signed-in account)";

  static isLoaded(): boolean { return typeof window !== "undefined" && !!window.puter?.ai?.chat; }
  static isSignedIn(): boolean {
    try { return !!window.puter?.auth?.isSignedIn?.(); } catch { return false; }
  }
  /** Waits for the CDN script to be usable (it's a blocking tag, but ad-blockers/retries can delay it). */
  static async waitForReady(timeoutMs = 8000): Promise<void> {
    const start = Date.now();
    while (!(typeof window !== "undefined" && window.puter?.ai?.chat)) {
      if (Date.now() - start > timeoutMs)
        throw new ProviderError("unsupported", "Puter.js didn't load — offline, or blocked by an ad-blocker/extension. Allow js.puter.com and reload.");
      await new Promise(r => setTimeout(r, 120));
    }
  }
  /** Triggers the Puter sign-in popup; resolves once the user is authenticated. */
  static async signIn(): Promise<void> {
    await PuterProvider.waitForReady();
    try { await window.puter.auth.signIn(); } catch (e) {
      throw new ProviderError("auth", `Puter sign-in didn't complete (popup closed or blocked — allow popups for this site): ${(e as Error).message}`);
    }
    if (!PuterProvider.isSignedIn()) throw new ProviderError("auth", "Puter sign-in did not stick. Press Re-check, or sign in again.");
  }
  static async signOut(): Promise<void> {
    try { await window.puter?.auth?.signOut?.(); } catch { /* ignore */ }
  }

  private async call(system: string, user: string, schemas: JsonSchemas, opts: ChatOpts = {}): Promise<unknown> {
    await PuterProvider.waitForReady();
    let raw: unknown;
    try {
      // No `model` option on purpose — Puter selects the model automatically on their end.
      raw = await window.puter.ai.chat(
        [{ role: "system", content: system + shapeHint(schemas.strict) }, { role: "user", content: user }],
        {},
      );
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      const msg = String((e as Error)?.message ?? e);
      if (/sign|auth|login|token|permission|401|403/i.test(msg))
        throw new ProviderError("auth", `Puter didn't recognize the connection/session. Sign in again (AI settings → Puter → “Sign in with Puter”), then press Test connection. Details: ${msg}`);
      if (/quota|credit|limit|402|429|exhaust/i.test(msg))
        throw new ProviderError("quota", `Puter allowance exhausted for this account: ${msg}`);
      if (/popup|blocked|closed/i.test(msg))
        throw new ProviderError("auth", `Puter's popup was blocked. Allow popups for this site and try again. Details: ${msg}`);
      throw new ProviderError("network", `Puter request failed: ${msg}`);
    }
    // puter.ai.chat returns a string, or a ChatResponse object whose .message.content holds the text.
    const text = typeof raw === "string"
      ? raw
      : (raw as any)?.message?.content ?? (raw as any)?.text ?? (raw as any)?.toString?.() ?? "";
    if (!String(text).trim()) throw new ProviderError("truncated", "Puter returned an empty response.");
    return safeParse(stripThink(String(text)));
  }

  async generateRaw(p: GenerateParams): Promise<unknown> {
    return this.call(SYSTEM_PROMPT, buildUserPrompt(p), { strict: QUIZ_JSON_SCHEMA, gemini: QUIZ_GEMINI_SCHEMA, name: "quiz_question" }, { temperature: 0.8, signal: p.signal });
  }

  async chatJSON(system: string, user: string, schemas: JsonSchemas, opts: ChatOpts = {}): Promise<unknown> {
    return this.call(system, user, schemas, opts);
  }

  /** Confirms Puter.js loaded and the signed-in account can actually complete a call. */
  async verify(): Promise<void> {
    await this.call(
      "You are a connectivity test. Reply with JSON only.",
      'Return exactly {"ok":true}.',
      { strict: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }, gemini: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, name: "connectivity_check" },
      { temperature: 0, maxTokens: 32 },
    );
  }
}