import { test, expect } from "vitest";
import { answerConsistent, QuizEngine } from "../src/quiz/engine";
import type { QuizQuestion } from "../src/quiz/schema";

// The screenshot bug: correctIndex → "Earth's rotation" while the explanation
// names tectonic plates as the reason ocean basins formed.
const mismatched: QuizQuestion = {
  question: "What is the main reason for the formation of ocean basins?",
  options: ["Tectonic plates", "The Earth's magnetic field", "Earth's rotation", "The Earth's surface curvature"],
  correctIndex: 2,
  explanation: "The main reason for the formation of ocean basins is Earth's tectonic plates moving apart.",
};

test("rejects explanation that names a different option than correctIndex (screenshot bug)", () => {
  expect(answerConsistent(mismatched)).toBe(false);
});

test("accepts when the explanation argues for the selected option", () => {
  expect(answerConsistent({ ...mismatched, correctIndex: 0 })).toBe(true);
});

test("accepts generic explanations with no option mentions", () => {
  expect(answerConsistent({ ...mismatched, explanation: "This is a well-known scientific fact." })).toBe(true);
});

test("single-word coincidences don't trigger rejection", () => {
  const q: QuizQuestion = {
    question: "What is the capital of France?",
    options: ["Paris", "London", "Madagascar", "Berlin"],
    correctIndex: 0,
    explanation: "The answer is Paris, a large city in Europe.",
  };
  // "paris" appears once for option 0; no other option reaches the threshold of 2
  expect(answerConsistent(q)).toBe(true);
});

test("engine surfaces the consistency failure as the retry reason", async () => {
  let calls = 0;
  const badProvider = {
    id: "webllm" as const,
    label: "test",
    generateRaw: async () => { calls++; return { ...mismatched }; },
    chatJSON: async () => ({}),
    verify: async () => {},
  };
  const eng = new QuizEngine(badProvider as any, { maxAttempts: 3 });
  await expect(eng.next("ocean geography", "medium")).rejects.toThrow(/explanation disagreed|seen all/);
  expect(calls).toBe(3); // every attempt rejected → retried, never served
});
