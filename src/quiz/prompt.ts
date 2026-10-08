export type Difficulty = "easy" | "medium" | "hard";
export interface GenerateParams { topic: string; difficulty: Difficulty; avoid: string[]; signal?: AbortSignal; }

export const SYSTEM_PROMPT =
  "You are Quiz Mastermind, an interactive quiz host. Write one factually accurate multiple-choice trivia question. " +
  "Exactly 4 options, exactly one correct. Options must be distinct and plausible. Keep content suitable for all ages. " +
  "Never reference the option letters or positions in the question or explanation. " +
  "Vary your questions: explore different sub-topics, eras, places, people and angles of the given topic — avoid the most obvious, commonly-asked trivia. Respond with JSON only.";

export const JSON_SHAPE_HINT =
  " Output ONLY a single JSON object with keys: question (string), options (array of 4 strings), correctIndex (integer 0-3), explanation (string). No markdown, no prose.";

/** Rotating angles that steer the model toward a different slice of the topic on each request. */
const ANGLES = [
  "history and origins", "science and nature", "people and biographies", "geography and places",
  "arts, literature and culture", "sports and games", "technology and inventions", "food and drink",
  "animals and the natural world", "music and entertainment", "records and extremes", "language and words",
  "recent events and modern developments", "surprising and little-known facts", "myths, legends and traditions",
];
/** Rotating question styles so the phrasing itself varies too. */
const STYLES = [
  "a 'which of these' question", "a 'who' question", "a 'where' question", "a 'when' question",
  "a 'how many / how much' question", "a true-or-false-style fact question with 4 statements",
  "a 'what is it known for' question", "a question about a first, a record or a superlative",
];

/** Compact prompt for small in-browser models — short context, easy-to-follow JSON shape.
 *  Large prompt plumbing (angles/styles/nonces/long avoid-lists) makes 0.5-1B models emit
 *  invalid JSON; keeping it minimal raises first-attempt validity = faster question generation. */
export const LOCAL_SYSTEM_PROMPT =
  "You are a quiz host. Reply with ONE JSON object only — no markdown, no commentary. " +
  "Fields: question, options (4 DIFFERENT plain-text strings, never letter-prefixed), correctIndex, explanation. " +
  "Write direct factual trivia suitable for all ages — a real question about the topic, " +
  "never a question about questions or about how quizzes work. " +
  "explanation: one or two sentences stating WHY the best answer is correct. " +
  "correctIndex must mark that same option.";

/** Concrete topic slices (not abstract phrases — small models parrot hints like
 *  "Which of the following is <hint>?" if the hint reads like a fill-in-the-blank). */
const LOCAL_ANGLES = ["its origins and history", "key people involved", "the science behind it", "records and extremes", "famous events", "how it is used today", "its most surprising details", "where you would encounter it"];

export function buildLocalUserPrompt(p: GenerateParams): string {
  // Deliberately NOT listing already-asked questions: 0.5-1B models copy the example
  // instead of avoiding it (verified live: 3/3 attempts returned the avoid-listed
  // question verbatim). Variety comes from the rotating angle + engine dedup retries.
  const angle = LOCAL_ANGLES[Math.floor(Math.random() * LOCAL_ANGLES.length)];
  return `Topic: ${p.topic}\nDifficulty: ${p.difficulty}\nWrite a question about ${angle} of this topic.`;
}

export function buildUserPrompt(p: GenerateParams): string {
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const style = STYLES[Math.floor(Math.random() * STYLES.length)];
  const nonce = Math.random().toString(36).slice(2, 10);
  const avoid = p.avoid.length ? `\nDo NOT repeat, reword or paraphrase any of these already-asked questions:\n- ${p.avoid.slice(-60).join("\n- ")}` : "";
  return `Topic: ${p.topic}\nDifficulty: ${p.difficulty}\nFocus this question on the angle of: ${angle}. Phrase it as ${style}.\nQuestion seed: ${nonce} (ignore this in the output; it only makes your question unique)${avoid}`;
}
