import { idbGet, idbSet } from "./idb";
import { normalizeQuestion, type QuizQuestion } from "../quiz/schema";
const key = (t: string, d: string) => `q:${d}:${t.trim().toLowerCase()}`;
export async function cacheGet(t: string, d: string): Promise<QuizQuestion[]> { return (await idbGet<QuizQuestion[]>(key(t, d))) ?? []; }
export async function cachePut(t: string, d: string, q: QuizQuestion) {
  const list = await cacheGet(t, d);
  if (list.some((x) => normalizeQuestion(x.question) === normalizeQuestion(q.question))) return;
  list.push(q); await idbSet(key(t, d), list.slice(-200));
}
export async function cacheClear(t: string, d: string) { await idbSet(key(t, d), []); }
