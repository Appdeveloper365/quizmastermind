import { test, expect } from "vitest";
import { tooSimilar } from "../src/quiz/engine";

test("near-paraphrase of same question is flagged", () => {
  expect(tooSimilar("What is the capital of France?", "What is the capital of France")).toBe(true);
});

test("lightly reworded duplicate is flagged", () => {
  expect(tooSimilar("Which planet is known as the Red Planet?", "Which planet is known as the Red Planet, often?")).toBe(true);
});

test("unrelated questions are not flagged", () => {
  expect(tooSimilar("What is the capital of France?", "How many legs does a spider have?")).toBe(false);
});

test("different questions sharing a couple of words are not flagged", () => {
  expect(tooSimilar("Who wrote the novel Pride and Prejudice?", "Who directed the film Pride and Prejudice?")).toBe(false);
});

test("empty token sets are safe (no false positive, no crash)", () => {
  expect(tooSimilar("!!!", "???")).toBe(false);
  expect(tooSimilar("", "What is 2+2?")).toBe(false);
});
