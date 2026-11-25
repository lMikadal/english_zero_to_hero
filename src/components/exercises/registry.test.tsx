import { describe, expect, it } from "vitest";
import { SUPPORTED_TYPES } from "@/lib/answers/grade";
import { allExercises } from "@/lib/answers/test-content";
import { isRegistered, REGISTERED_TYPES, renderExercise } from "./registry";

const handlers = { vocab: {}, onAnswer: () => {}, onContinue: () => {} };

describe("registry", () => {
  it("registers exactly the six sound-based types for now", () => {
    expect([...REGISTERED_TYPES].sort()).toEqual(["dictation", "listen_choose", "minimal_pair", "phoneme_intro", "repeat_after_me", "shadowing"]);
  });

  it("renders every registered type and nothing for the others", () => {
    for (const { exercise } of allExercises()) {
      const out = renderExercise(exercise, handlers);
      expect(out === null).toBe(!isRegistered(exercise.type));
    }
  });

  it("only registers types the contract can grade", () => {
    for (const t of REGISTERED_TYPES) expect(SUPPORTED_TYPES).toContain(t);
  });
});
