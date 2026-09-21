import { QUIZ_JSON_SCHEMA, QUIZ_GEMINI_SCHEMA } from "../quiz/schema";
import { SYSTEM_PROMPT, buildUserPrompt, type GenerateParams } from "../quiz/prompt";
import { ProviderError, mapHttpError, safeParse, type ChatOpts, type JsonSchemas, type QuizProvider } from "./types";
import { BYOK, providerLabel } from "./registry";

export class GeminiProvider implements QuizProvider {
  readonly id = "gemini" as const;
  readonly label = providerLabel(BYOK.gemini);
  constructor(private apiKey: string, private model = BYOK.gemini.model) {}

  async generateRaw(p: GenerateParams): Promise<unknown> {
    return this.chatJSON(SYSTEM_PROMPT, buildUserPrompt(p), { strict: QUIZ_JSON_SCHEMA, gemini: QUIZ_GEMINI_SCHEMA, name: "quiz_question" }, { temperature: 1.0, maxTokens: 1500, signal: p.signal });
  }

  async chatJSON(system: string, user: string, schemas: JsonSchemas, opts: ChatOpts = {}): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
        method: "POST", signal: opts.signal,
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: opts.temperature ?? 0.8, maxOutputTokens: opts.maxTokens ?? 1500, responseMimeType: "application/json", responseSchema: schemas.gemini },
        }),
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ProviderError("network", `Couldn't reach Google's Gemini API — network, CORS or an ad-blocker. ${(e as Error).message}`);
    }
    if (!res.ok) throw await mapHttpError(res);
    const data = await res.json().catch(() => null);
    if (!data) throw new ProviderError("unknown", "Gemini returned a non-JSON response.");
    if (data.promptFeedback?.blockReason) throw new ProviderError("refusal", `Blocked: ${data.promptFeedback.blockReason}`);
    const cand = data.candidates?.[0];
    if (!cand) throw new ProviderError("unknown", "No candidates in response");
    if (cand.finishReason && cand.finishReason !== "STOP") throw new ProviderError(cand.finishReason === "MAX_TOKENS" ? "truncated" : "refusal", `finishReason=${cand.finishReason}`);
    return safeParse(cand.content?.parts?.map((x: any) => x.text ?? "").join("") ?? "");
  }

  /** Real round-trip: proves the key and the model name both work. */
  async verify(): Promise<void> {
    await this.chatJSON(
      "You are a connectivity test. Reply with JSON only.",
      'Return exactly {"ok":true}.',
      { strict: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }, gemini: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, name: "connectivity_check" },
      { temperature: 0, maxTokens: 32 },
    );
  }
}
