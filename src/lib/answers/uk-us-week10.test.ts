// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lessonSchema, type Exercise } from "@/lib/content/schema";
import { gradeExercise } from "./grade";
import { otherSpelling } from "./spelling";

const lesson = (day: number) => lessonSchema.parse(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../../content/lessons/day-${String(day).padStart(3, "0")}.json`), "utf8")));
const find = (day: number, id: string): Exercise => lesson(day).sections.flatMap((s) => s.exercises).find((e) => e.id === id)!;

describe("UK / US spelling in the week-10 words", () => {
  it("centre / center is in the spelling table (the only UK/US pair among the 46 week-10 words)", () => {
    expect(otherSpelling("centre")).toBe("center");
    expect(otherSpelling("centres")).toBe("centers");
  });
  it("a translation typed with the US spelling or 'town centre' grades correct (d069-write-06)", () => {
    const ex = lesson(69).sections.flatMap((s) => s.exercises).find((e) => e.type === "translate_th_en" && e.accept[0].includes("centre"))!;
    for (const t of ["The cafe is in the centre of the town", "The cafe is in the center of the town", "The cafe is in the town centre", "The cafe is in the town center", "the cafe is in the Center of the town."]) {
      expect(gradeExercise(ex, { kind: "text", text: t }), t).toEqual({ correct: true, score: 1 });
    }
  });
  it("the week-10 vocab 'centre' lists its US spelling", () => {
    void find;
    const bank = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../../content/vocab/oxford-3000/a1.json"), "utf8")) as { word: string; forms?: Record<string, string> }[];
    expect(bank.find((w) => w.word === "centre")?.forms?.usSpelling).toBe("center");
  });
});
