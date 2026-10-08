import { validateQuizQuestion, shuffleOptions, normalizeQuestion, type QuizQuestion } from "./schema";
export { validateQuizQuestion, shuffleOptions, normalizeQuestion, OPTION_COUNT } from "./schema";
export type { Validation } from "./schema";
import type { Difficulty } from "./prompt";
import { ProviderError, type QuizProvider } from "../providers/types";
import { cacheGet, cachePut, cacheClear } from "../storage/cache";
import { seenGet, seenAdd, seenClear } from "../storage/history";

export interface EngineOptions { maxAttempts?: number; reuseCache?: boolean; }

const STOP = new Set(["the", "a", "an", "of", "in", "on", "at", "to", "is", "are", "was", "were", "which", "what", "who", "whom", "whose", "where", "when", "why", "how", "many", "much", "does", "do", "did", "can", "you", "name", "first", "last", "most", "and", "or", "for", "with", "by", "from"]);
const tokens = (s: string) => new Set(normalizeQuestion(s).replace(/[^a-z0-9 ]/g, "").split(" ").filter((w) => w && !STOP.has(w)));
/** Word-overlap (Jaccard) similarity — catches paraphrases that exact-match dedup misses. Exported for tests. */
export function tooSimilar(a: string, b: string): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter) >= 0.6;
}

/** Small models often pair a plausible correctIndex with an explanation that names a
 *  DIFFERENT option as correct (e.g. correctIndex → "Earth's rotation" while the
 *  explanation says "…is Earth's tectonic plates"). Reject when some other option is
 *  mentioned notably more than the selected one, so the engine retries instead of
 *  scoring a wrong answer as correct. Exported for tests. */
export function answerConsistent(q: QuizQuestion): boolean {
  const et = tokens(q.explanation);
  if (!et.size) return true; // nothing to judge against
  const counts = q.options.map((o) => { let n = 0; for (const w of tokens(o)) if (et.has(w)) n++; return n; });
  const picked = counts[q.correctIndex];
  const bestOther = Math.max(...counts.filter((_, i) => i !== q.correctIndex));
  return !(bestOther >= 2 && bestOther > picked);
}

export class QuizEngine {
  private maxAttempts: number; private reuseCache: boolean;
  constructor(public provider: QuizProvider, opts: EngineOptions = {}) {
    this.maxAttempts = opts.maxAttempts ?? 3; this.reuseCache = opts.reuseCache ?? false;
  }
  static resetHistory(topic: string, difficulty: Difficulty) { return Promise.all([seenClear(topic, difficulty), cacheClear(topic, difficulty)]).then(() => {}); }

  async next(topic: string, difficulty: Difficulty, signal?: AbortSignal): Promise<QuizQuestion> {
    const seenList = await seenGet(topic, difficulty);
    const seen = new Set(seenList.map(normalizeQuestion));
    const cached = await cacheGet(topic, difficulty);
    // Exact repeats are banned forever; near-paraphrase checks only the RECENT window —
    // full-history similarity makes every attempt on a narrow topic look like a dupe,
    // which is what used to force users into "Forget what I've seen" to get ANY question.
    const recent = seenList.slice(-60);
    const isDupe = (q: string) => seen.has(normalizeQuestion(q)) || recent.some((s) => tooSimilar(q, s));
    const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const serve = async (q: QuizQuestion, fresh: boolean) => { await seenAdd(topic, difficulty, q.question); if (fresh) await cachePut(topic, difficulty, q); return shuffleOptions(q); };
    // Replay from the saved pool (any saved question except the one just asked) —
    // a replayed question beats an error wall. Note: every cached question has by
    // definition been seen, so filtering the cache by isDupe() can never serve anything.
    const replay = (): QuizQuestion | null => {
      const last = normalizeQuestion(seenList.at(-1) ?? " ");
      const alt = cached.filter((q) => normalizeQuestion(q.question) !== last);
      return alt.length ? pick(alt) : null;
    };

    if (this.reuseCache) { const c = replay(); if (c) return serve(c, false); }

    const avoid = seenList.slice(-60);
    let lastReason = "unknown";
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let raw: unknown;
      try { raw = await this.provider.generateRaw({ topic, difficulty, avoid, signal }); }
      catch (e) { if (e instanceof ProviderError && e.isFatal) throw e; if (signal?.aborted) throw e; lastReason = (e as Error).message; continue; }
      const v = validateQuizQuestion(raw);
      if (!v.ok) { lastReason = v.reason; continue; }
      if (isDupe(v.value.question)) { lastReason = "AI repeated a seen question"; continue; }
      if (!answerConsistent(v.value)) { lastReason = "the explanation disagreed with the correct answer"; continue; }
      return serve(v.value, true);
    }
    const fb = replay(); if (fb) return serve(fb, false);
    throw new ProviderError("unknown", cached.length
      ? `Couldn't get a new question (${lastReason}) and you've seen all ${cached.length} saved ones for "${topic}". Press "Forget what I've seen" to replay.`
      : `Could not get a valid question after ${this.maxAttempts} attempts (${lastReason})`);
  }
}
