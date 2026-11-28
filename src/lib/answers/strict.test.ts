import { describe, expect, it } from "vitest";
import type { Exercise } from "@/lib/content/schema";
import { gradeExercise } from "./grade";

const instruction = { th: "ก" };
const ex = (e: Record<string, unknown>) => e as unknown as Exercise;
const text = (t: string) => ({ kind: "text" as const, text: t });

describe("strict items skip contraction and digit folding", () => {
  const dictation = (strict?: boolean) => ex({ id: "d001-listen-01", type: "dictation", instruction, audioText: "He is ten", ...(strict === undefined ? {} : { strict }) });
  const translate = (strict?: boolean) => ex({ id: "d001-write-01", type: "translate_th_en", instruction, th: "ก", accept: ["It is a door"], ...(strict === undefined ? {} : { strict }) });
  const blank = (strict?: boolean) => ex({ id: "d001-write-02", type: "fill_blank", instruction, text: "I am ___", answer: ["ten"], ...(strict === undefined ? {} : { strict }) });

  it("dictation", () => {
    expect(gradeExercise(dictation(), text("He's 10"))).toEqual({ correct: true, score: 1 });
    expect(gradeExercise(dictation(false), text("He's 10"))).toEqual({ correct: true, score: 1 });
    expect(gradeExercise(dictation(true), text("He's 10"))).toEqual({ correct: false, score: 0 });
    expect(gradeExercise(dictation(true), text("he is ten."))).toEqual({ correct: true, score: 1 });
  });
  it("translate_th_en", () => {
    expect(gradeExercise(translate(), text("It's a door"))).toEqual({ correct: true, score: 1 });
    expect(gradeExercise(translate(true), text("It's a door"))).toEqual({ correct: false, score: 0 });
  });
  it("fill_blank", () => {
    expect(gradeExercise(blank(), { kind: "texts", texts: ["10"] })).toEqual({ correct: true, score: 1, items: [true] });
    expect(gradeExercise(blank(true), { kind: "texts", texts: ["10"] })).toMatchObject({ correct: false });
  });
});
