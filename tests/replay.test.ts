import { test, expect } from "vitest";
import { QuizEngine } from "../src/quiz/engine";
import { seenAdd } from "../src/storage/history";
import { cachePut } from "../src/storage/cache";
import type { QuizQuestion } from "../src/quiz/schema";

const q = (text: string): QuizQuestion => ({
  question: text,
  options: ["Alpha", "Beta", "Gamma", "Delta"],
  correctIndex: 0,
  explanation: "Alpha is correct because reasons.",
});

const rawOf = (text: string) => ({ ...q(text) });

const neverCalled = {
  id: "webllm" as const, label: "test",
  generateRaw: async () => { throw new Error("provider should not be called"); },
  chatJSON: async () => ({}), verify: async () => {},
};

test("reuseCache serves from the saved pool without calling the provider", async () => {
  const topic = "replay-pool";
  await seenAdd(topic, "medium", "Question A already asked?");
  await cachePut(topic, "medium", q("Question A already asked?"));
  await cachePut(topic, "medium", q("Entirely different Question B here?"));
  const eng = new QuizEngine(neverCalled as any, { reuseCache: true });
  const got = await eng.next(topic, "medium");
  // pool has 2, one is the last asked → serves the other
  expect(got.question).toBe("Entirely different Question B here?");
});

test("when generation keeps failing, engine falls back to a replayed pool question instead of erroring", async () => {
  const topic = "fallback-replay";
  await seenAdd(topic, "medium", "Seen question one?");
  await cachePut(topic, "medium", q("Seen question one?"));
  await cachePut(topic, "medium", q("Saved alternative question two?"));
  let calls = 0;
  const repeatBot = {
    id: "webllm" as const, label: "test",
    generateRaw: async () => { calls++; return rawOf("Seen question one?"); }, // always an exact repeat
    chatJSON: async () => ({}), verify: async () => {},
  };
  const eng = new QuizEngine(repeatBot as any, { maxAttempts: 3 });
  const got = await eng.next(topic, "medium");
  expect(calls).toBe(3); // retries first…
  expect(got.question).toBe("Saved alternative question two?"); // …then replays, no wall
});

test("the 'seen all' error only remains when there is truly nothing else to serve (pool = last question)", async () => {
  const topic = "wall-pool-one";
  await seenAdd(topic, "medium", "Only question ever?");
  await cachePut(topic, "medium", q("Only question ever?"));
  const repeatBot = {
    id: "webllm" as const, label: "test",
    generateRaw: async () => rawOf("Only question ever?"),
    chatJSON: async () => ({}), verify: async () => {},
  };
  const eng = new QuizEngine(repeatBot as any, { maxAttempts: 2 });
  await expect(eng.next(topic, "medium")).rejects.toThrow(/seen all 1 saved ones/);
});

test("exact repeats are rejected even beyond the recent window; near-paraphrases older than the window are not", async () => {
  const topic = "window-scope";
  const oldQ = "What is the capital of France?";
  for (let i = 0; i < 70; i++) await seenAdd(topic, "medium", i === 0 ? oldQ : `Filler question number ${i} about topic ${i}?`);
  // exact repeat of question #1 (70 asks ago) → rejected
  const exactBot = {
    id: "webllm" as const, label: "test",
    generateRaw: async () => rawOf(oldQ),
    chatJSON: async () => ({}), verify: async () => {},
  };
  await expect(new QuizEngine(exactBot as any, { maxAttempts: 2 }).next(topic, "medium"))
    .rejects.toThrow(/repeated a seen question/);
  // near-paraphrase of that same old question → accepted (outside the 60-question window)
  const paraBot = {
    id: "webllm" as const, label: "test",
    generateRaw: async () => rawOf("What is the capital city of France"),
    chatJSON: async () => ({}), verify: async () => {},
  };
  const got = await new QuizEngine(paraBot as any, { maxAttempts: 2 }).next(topic, "medium");
  expect(got.question).toBe("What is the capital city of France");
});
