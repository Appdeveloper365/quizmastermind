export interface QuizQuestion { question: string; options: string[]; correctIndex: number; explanation: string; }
export const OPTION_COUNT = 4;

/** Strict JSON schema — used for structured output on OpenAI-compatible json_schema mode. */
export const QUIZ_JSON_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    options: { type: "array", items: { type: "string" }, minItems: OPTION_COUNT, maxItems: OPTION_COUNT },
    correctIndex: { type: "integer", enum: [0, 1, 2, 3] },
    explanation: { type: "string" },
  },
  required: ["question", "options", "correctIndex", "explanation"],
  additionalProperties: false,
} as const;

/** Gemini's OpenAPI subset: no additionalProperties, no integer enums. */
export const QUIZ_GEMINI_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    options: { type: "array", items: { type: "string" }, minItems: OPTION_COUNT, maxItems: OPTION_COUNT },
    correctIndex: { type: "integer", minimum: 0, maximum: OPTION_COUNT - 1 },
    explanation: { type: "string" },
  },
  required: ["question", "options", "correctIndex", "explanation"],
};

export type Validation = { ok: true; value: QuizQuestion } | { ok: false; reason: string };
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function validateQuizQuestion(raw: unknown): Validation {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not an object" };
  const r = raw as Record<string, unknown>;
  if (typeof r.question !== "string" || r.question.trim().length < 8) return { ok: false, reason: "question missing/too short" };
  if (!Array.isArray(r.options) || r.options.length !== OPTION_COUNT) return { ok: false, reason: `need exactly ${OPTION_COUNT} options` };
  if (!r.options.every((o) => typeof o === "string" && o.trim().length > 0)) return { ok: false, reason: "empty/non-string option" };
  if (new Set((r.options as string[]).map(norm)).size !== OPTION_COUNT) return { ok: false, reason: "duplicate options" };
  if (!Number.isInteger(r.correctIndex) || (r.correctIndex as number) < 0 || (r.correctIndex as number) >= OPTION_COUNT) return { ok: false, reason: "correctIndex out of range" };
  if (typeof r.explanation !== "string" || r.explanation.trim().length === 0) return { ok: false, reason: "explanation missing" };
  return { ok: true, value: { question: r.question.trim(), options: (r.options as string[]).map((o) => o.trim()), correctIndex: r.correctIndex as number, explanation: r.explanation.trim() } };
}

/** Kills answer-position bias. */
export function shuffleOptions(q: QuizQuestion, rng: () => number = Math.random): QuizQuestion {
  const idx = q.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { ...q, options: idx.map((i) => q.options[i]), correctIndex: idx.indexOf(q.correctIndex) };
}
export const normalizeQuestion = norm;
