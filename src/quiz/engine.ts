import { validateQuizQuestion, shuffleOptions, normalizeQuestion, type QuizQuestion } from "./schema";
import type { Difficulty } from "./prompt";
import { ProviderError, type QuizProvider } from "../providers/types";
import { cacheGet, cachePut, cacheClear } from "../storage/cache";
import { seenGet, seenAdd, seenClear } from "../storage/history";

export interface EngineOptions { maxAttempts?: number; reuseCache?: boolean; }

const STOP = new Set(["the", "a", "an", "of", "in", "on", "at", "to", "is", "are", "was", "were", "which", "what", "who", "whom", "whose", "where", "when", "why", "how", "many", "much", "does", "do", "did", "can", "you", "name", "first", "last", "most", "and", "or", "for", "with", "by", "from"]);
const tokens = (s: string) => new Set(normalizeQuestion(s).replace(/[^a-z0-9 ]/g, "").split(" ").filter((w) => w && !STOP.has(w)));
/** Word-overlap (Jaccard) similarity — catches paraphrases that exact-match dedup misses. */
function tooSimilar(a: string, b: string): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter) >= 0.6;
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
    // Anything ever seen (history + cache) counts as a duplicate, exact or near-paraphrase.
    const seenAll = [...seenList, ...(await cacheGet(topic, difficulty)).map((q) => q.question)];
    const isDupe = (q: string) => seen.has(normalizeQuestion(q)) || seenAll.some((s) => tooSimilar(q, s));
    const unseenCached = async () => (await cacheGet(topic, difficulty)).filter((q) => !isDupe(q.question));
    const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const serve = async (q: QuizQuestion, fresh: boolean) => { await seenAdd(topic, difficulty, q.question); if (fresh) await cachePut(topic, difficulty, q); return shuffleOptions(q); };

    if (this.reuseCache) { const c = await unseenCached(); if (c.length) return serve(pick(c), false); }

    const avoid = seenList.slice(-60);
    let lastReason = "unknown";
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let raw: unknown;
      try { raw = await this.provider.generateRaw({ topic, difficulty, avoid, signal }); }
      catch (e) { if (e instanceof ProviderError && e.isFatal) throw e; if (signal?.aborted) throw e; lastReason = (e as Error).message; continue; }
      const v = validateQuizQuestion(raw);
      if (!v.ok) { lastReason = v.reason; continue; }
      if (isDupe(v.value.question)) { lastReason = "AI repeated a seen question"; continue; }
      return serve(v.value, true);
    }
    const c = await unseenCached(); if (c.length) return serve(pick(c), false);
    const total = (await cacheGet(topic, difficulty)).length;
    throw new ProviderError("unknown", total
      ? `Couldn't get a new question (${lastReason}) and you've seen all ${total} saved ones for "${topic}". Press "Forget what I've seen" to replay.`
      : `Could not get a valid question after ${this.maxAttempts} attempts (${lastReason})`);
  }
}
