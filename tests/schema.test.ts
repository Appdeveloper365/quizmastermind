import { test, expect } from "vitest";
import { validateQuizQuestion, shuffleOptions, normalizeQuestion, OPTION_COUNT } from "../src/quiz/schema";

const good = {
  question: "What is the capital of France?",
  options: ["Paris", "Lyon", "Marseille", "Nice"],
  correctIndex: 0,
  explanation: "Paris has been France's capital since the Middle Ages.",
};

test("valid question passes", () => {
  const v = validateQuizQuestion(good);
  expect(v.ok).toBe(true);
  if (v.ok) expect(v.value.question).toBe(good.question);
});

test("rejects non-object", () => {
  expect(validateQuizQuestion(null).ok).toBe(false);
  expect(validateQuizQuestion("hi").ok).toBe(false);
  expect(validateQuizQuestion(undefined).ok).toBe(false);
});

test("rejects short/missing question", () => {
  expect(validateQuizQuestion({ ...good, question: "hi" }).ok).toBe(false);
  expect(validateQuizQuestion({ ...good, question: 42 }).ok).toBe(false);
});

test(`rejects wrong option count (need ${OPTION_COUNT})`, () => {
  expect(validateQuizQuestion({ ...good, options: ["a", "b", "c"] }).ok).toBe(false);
  expect(validateQuizQuestion({ ...good, options: ["a", "b", "c", "d", "e"] }).ok).toBe(false);
  expect(validateQuizQuestion({ ...good, options: "abcd" }).ok).toBe(false);
});

test("rejects duplicate options (case/whitespace-insensitive)", () => {
  const dupe = { ...good, options: ["Paris", "paris", "Lyon", "  Lyon "] };
  const v = validateQuizQuestion(dupe);
  expect(v.ok).toBe(false);
  if (!v.ok) expect(v.reason).toMatch(/duplicate/);
});

test("rejects out-of-range / non-integer correctIndex", () => {
  expect(validateQuizQuestion({ ...good, correctIndex: -1 }).ok).toBe(false);
  expect(validateQuizQuestion({ ...good, correctIndex: 4 }).ok).toBe(false);
  expect(validateQuizQuestion({ ...good, correctIndex: 1.5 }).ok).toBe(false);
  expect(validateQuizQuestion({ ...good, correctIndex: "0" }).ok).toBe(false);
});

test("rejects missing explanation", () => {
  expect(validateQuizQuestion({ ...good, explanation: "" }).ok).toBe(false);
  expect(validateQuizQuestion({ ...good, explanation: 7 }).ok).toBe(false);
});

test("trims fields on success", () => {
  const v = validateQuizQuestion({ ...good, question: "  What is the capital of France?  ", explanation: "  Because. " });
  expect(v.ok).toBe(true);
  if (v.ok) {
    expect(v.value.question).toBe("What is the capital of France?");
    expect(v.value.explanation).toBe("Because.");
  }
});

test("shuffleOptions preserves option multiset and correct answer", () => {
  for (let i = 0; i < 50; i++) {
    const s = shuffleOptions(good);
    expect(s.options.length).toBe(good.options.length);
    expect([...s.options].sort()).toEqual([...good.options].sort());
    expect(s.options[s.correctIndex]).toBe(good.options[good.correctIndex]);
  }
});

test("shuffleOptions with fixed rng is deterministic", () => {
  const a = shuffleOptions(good, () => 0.5);
  const b = shuffleOptions(good, () => 0.5);
  expect(a).toEqual(b);
});

test("normalizeQuestion collapses case and whitespace", () => {
  expect(normalizeQuestion("  What   IS the CAPITAL  ")).toBe("what is the capital");
});
