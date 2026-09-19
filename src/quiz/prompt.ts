export type Difficulty = "easy" | "medium" | "hard";
export interface GenerateParams { topic: string; difficulty: Difficulty; avoid: string[]; signal?: AbortSignal; }

export const SYSTEM_PROMPT =
  "You are Quiz Mastermind, an interactive quiz host. Write one factually accurate multiple-choice trivia question. " +
  "Exactly 4 options, exactly one correct. Options must be distinct and plausible. Keep content suitable for all ages. " +
  "Never reference the option letters or positions in the question or explanation. Respond with JSON only.";

export const JSON_SHAPE_HINT =
  " Output ONLY a single JSON object with keys: question (string), options (array of 4 strings), correctIndex (integer 0-3), explanation (string). No markdown, no prose.";

export function buildUserPrompt(p: GenerateParams): string {
  const avoid = p.avoid.length ? `\nDo NOT repeat or paraphrase these already-asked questions:\n- ${p.avoid.slice(-25).join("\n- ")}` : "";
  return `Topic: ${p.topic}\nDifficulty: ${p.difficulty}${avoid}`;
}
