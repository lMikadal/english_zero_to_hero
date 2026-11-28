// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatProblem } from "../loader";
import type { Exercise } from "../schema";
import { CHECKPOINT_RULE, checkCheckpoints } from "./checkpoint";
import { arrange, baseLessons, baseSections, baseVocab, checkpointFile, cpId, ctxOf, dictation, pair, passage, repeatAfter, section, withSections, world } from "./checkpoint-test-support";
import { buildContext } from "./context";
import { instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const errors = (ctx = ctxOf()) => checkCheckpoints(ctx).filter((p) => p.severity !== "warning").map(formatProblem);
const warnings = (ctx = ctxOf()) => checkCheckpoints(ctx).filter((p) => p.severity === "warning").map(formatProblem);
const only = (lines: string[]) => {
  expect(lines).toHaveLength(1);
  return lines[0];
};

describe("rule checkpoint: baseline", () => {
  it("the valid world has no errors and no warnings, and every problem carries rule \"checkpoint\"", () => {
    expect(checkCheckpoints(ctxOf())).toEqual([]);
    expect(CHECKPOINT_RULE).toBe("checkpoint");
  });
  it("a repo without checkpoints reports nothing (also when the field is absent)", () => {
    expect(checkCheckpoints(buildContext({ lessons: baseLessons(), vocab: baseVocab() }))).toEqual([]);
    expect(checkCheckpoints(ctxOf({ checkpoints: [] }))).toEqual([]);
  });
  it("all problems are tagged with the rule and the checkpoint file", () => {
    const ctx = withSections((s) => s.slice(1));
    const ps = checkCheckpoints(ctx);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      expect(p.rule).toBe("checkpoint");
      expect(p.file).toBe("content/checkpoints/checkpoint-030.json");
    }
  });
});

describe("file name and ids (3.1 items 1-2)", () => {
  it("flags afterDay that disagrees with the file name", () => {
    const ctx = ctxOf({ checkpoints: [checkpointFile({}, "content/checkpoints/checkpoint-060.json")] });
    expect(only(errors(ctx))).toMatch(/afterDay 30 does not match file name checkpoint-060\.json/);
  });
  it("flags a d-id in a checkpoint, naming the id and the expected prefix", () => {
    const ctx = withSections((s) => { s[1].exercises[0].id = "d030-listen-01"; return s; });
    const msg = only(errors(ctx));
    expect(msg).toContain("[d030-listen-01]");
    expect(msg).toMatch(/must start with c030-/);
  });
  it("flags a c-id of another day", () => {
    const ctx = withSections((s) => { s[1].exercises[0].id = cpId("listen", 1, 60); return s; });
    expect(only(errors(ctx))).toMatch(/day 60 does not match afterDay 30/);
  });
  it("accepts ids of the right day for A = 60", () => {
    const sections = baseSections().map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e, id: e.id.replace("c030", "c060") })) }));
    const lessons = [...baseLessons(), lessonFile(60, [], [dictation("d060-listen-01", "Hello big cat.")])];
    expect(errors(ctxOf({ lessons, checkpoints: [checkpointFile({ afterDay: 60, sections })] }))).toEqual([]);
  });
});

describe("sections and weights (item 3)", () => {
  it("flags two sections of the same skill", () => {
    const ctx = withSections((s) => [...s, section("reading", 0, [repeatAfter(cpId("speak", 9))])]);
    expect(errors(ctx).join("\n")).toMatch(/skill "reading" has 2 sections/);
  });
  it.each([[99], [101], [85]])("flags weights that add up to %i", (total) => {
    const ctx = withSections((s) => { s[4].weight = total - 65; s[3].weight = 20; return s; });
    expect(only(errors(ctx))).toContain(`weights add up to ${total}, not 100`);
  });
  it("accepts weights that add up to exactly 100", () => {
    expect(errors(withSections((s) => { s[4].weight = 35; return s; }))).toEqual([]);
  });
});

describe("scored vs self-rated sections (item 4)", () => {
  it("flags a scored section with fewer than 3 exercises", () => {
    const ctx = withSections((s) => { s[1].exercises = s[1].exercises.slice(0, 2); return s; });
    expect(only(errors(ctx))).toMatch(/section "listening" \(weight 25\) has 2 exercise\(s\); a scored section needs at least 3/);
  });
  it("accepts exactly 3", () => expect(errors(ctxOf())).toEqual([]));
  it("a weight-0 section may have any number of exercises", () => {
    expect(errors(withSections((s) => { s[2].exercises = [repeatAfter(cpId("speak", 1))]; return s; }))).toEqual([]);
  });
  it.each(["repeat_after_me", "shadowing", "speak_answer"] as const)("flags %s inside a scored section", (type) => {
    const ex: Exercise = type === "repeat_after_me" ? repeatAfter(cpId("listen", 3))
      : type === "shadowing" ? { id: cpId("listen", 3), type, instruction, lines: ["Hello."] }
        : { id: cpId("listen", 3), type, instruction, prompt: "Hello?", sampleAnswer: "Hello." };
    const ctx = withSections((s) => { s[1].exercises[2] = ex; return s; });
    const msg = only(errors(ctx));
    expect(msg).toContain(`[${cpId("listen", 3)}]`);
    expect(msg).toContain(`${type} is self-rated`);
    expect(msg).toMatch(/weight 25/);
  });
  it.each(["minimal_pair", "listen_choose", "dictation", "read_passage", "arrange_words", "fill_blank", "translate_th_en", "vocab_match"] as const)(
    "flags %s inside a weight-0 section (not self-rated)", (type) => {
      const ex = { minimal_pair: pair(cpId("speak", 1)), listen_choose: { id: cpId("speak", 1), type, instruction, audioText: "Hello.", question: { en: "Q?", th: "คำถาม" }, choices: ["a", "b"], answer: 0 },
        dictation: dictation(cpId("speak", 1)), read_passage: passage(cpId("speak", 1)), arrange_words: arrange(cpId("speak", 1)),
        fill_blank: { id: cpId("speak", 1), type, instruction, text: "Hello ___.", answer: ["cat"] },
        translate_th_en: { id: cpId("speak", 1), type, instruction, th: "สวัสดี", accept: ["Hello"] },
        vocab_match: { id: cpId("speak", 1), type, instruction, pairs: [{ vocabId: "v-cat" }, { vocabId: "v-hello" }] } }[type] as Exercise;
      const msg = only(errors(withSections((s) => { s[2].exercises = [ex]; return s; })));
      expect(msg).toContain(`[${cpId("speak", 1)}]`);
      expect(msg).toMatch(/weight 0.*self-rated.*repeat_after_me, shadowing, speak_answer/);
    },
  );
  it("a scored section may not mix in a self-rated exercise, and a weight-0 section may not mix in a graded one", () => {
    const ctx = withSections((s) => { s[2].exercises.push(dictation(cpId("speak", 2))); return s; });
    expect(only(errors(ctx))).toContain(`[${cpId("speak", 2)}]`);
  });
});

describe("banned types (item 5)", () => {
  const banned: [string, Exercise][] = [
    ["phoneme_intro", { id: cpId("write", 4), type: "phoneme_intro", instruction, phoneme: "ae", ipa: "/æ/", tipTh: "ก", examples: ["cat"] }],
    ["free_write", { id: cpId("write", 4), type: "free_write", instruction, prompt: "Write.", minWords: 3 }],
    ["roleplay", { id: cpId("write", 4), type: "roleplay", instruction, scenario: { en: "Hello", th: "สวัสดี" }, aiRole: "friend", goals: [{ en: "Hello", th: "สวัสดี" }] }],
    ["spell_word", { id: cpId("write", 4), type: "spell_word", instruction, vocabId: "v-cat" }],
    ["use_in_sentence", { id: cpId("write", 4), type: "use_in_sentence", instruction, vocabId: "v-cat", prompt: "Use it." }],
    ["grammar_note", { id: cpId("write", 4), type: "grammar_note", instruction, titleTh: "ก", bodyTh: "ก", examples: [{ en: "Hello cat.", th: "ก" }], structures: ["third-person-s"] }],
  ];
  it.each(banned)("flags %s anywhere, once", (type, ex) => {
    const msg = only(errors(withSections((s) => { s[4].exercises.push(ex); return s; })));
    expect(msg).toContain(`[${cpId("write", 4)}]`);
    expect(msg).toContain(`type "${type}" is not allowed in a checkpoint`);
  });
  it.each(banned)("flags %s in a weight-0 section too", (type, ex) => {
    const msg = only(errors(withSections((s) => { s[2].exercises.push(ex); return s; })));
    expect(msg).toContain(`type "${type}" is not allowed in a checkpoint`);
  });
});

describe("no new words (item 7)", () => {
  const more = () => baseVocab()[0].items.concat(vocabItem({ id: "v-dog", word: "dog", examples: ["A dog."] }));
  const lessons = () => [...baseLessons(), lessonFile(31, ["v-dog"], [dictation("d031-listen-01", "Hello dog.")])];
  const run = (sections: ReturnType<typeof baseSections>) => buildContext({ lessons: lessons(), vocab: [vocabFile(more())], checkpoints: [checkpointFile({ sections })] });

  it("flags read_passage with a glossary", () => {
    const ctx = withSections((s) => { s[3].exercises[0] = { ...passage(cpId("read", 1)), glossary: { cat: "แมว" } } as Exercise; return s; });
    const msg = only(errors(ctx));
    expect(msg).toContain(`[${cpId("read", 1)}]`);
    expect(msg).toMatch(/must not have a "glossary"/);
  });
  it("accepts read_passage without a glossary", () => expect(errors(ctxOf())).toEqual([]));
  it("flags vocab_match with a word first taught after day A, naming the word and its day", () => {
    const s = baseSections();
    s[4].exercises[2] = { id: cpId("write", 3), type: "vocab_match", instruction, pairs: [{ vocabId: "v-cat" }, { vocabId: "v-dog" }] };
    const msg = only(errors(run(s)));
    expect(msg).toContain(`[${cpId("write", 3)}]`);
    expect(msg).toMatch(/"dog" \(v-dog\), which is first taught on day 31, after day 30/);
  });
  it("flags vocab_match with a word no lesson teaches", () => {
    const s = baseSections();
    s[4].exercises[2] = { id: cpId("write", 3), type: "vocab_match", instruction, pairs: [{ vocabId: "v-cat" }, { vocabId: "v-dog" }] };
    const ctx = buildContext({ lessons: baseLessons(), vocab: [vocabFile(more())], checkpoints: [checkpointFile({ sections: s })] });
    expect(only(errors(ctx))).toMatch(/"dog" \(v-dog\), which is not taught in any lesson/);
  });
  it("accepts vocab_match with words taught on or before day A (day 30 itself counts)", () => {
    const l30 = lessonFile(30, ["v-dog"], [dictation("d030-listen-01", "Hello dog.")]);
    const s = baseSections();
    s[4].exercises[2] = { id: cpId("write", 3), type: "vocab_match", instruction, pairs: [{ vocabId: "v-cat" }, { vocabId: "v-dog" }] };
    const ctx = buildContext({ lessons: [baseLessons()[0], l30], vocab: [vocabFile(more())], checkpoints: [checkpointFile({ sections: s })] });
    expect(errors(ctx)).toEqual([]);
  });
});

describe("phonemes (item 8)", () => {
  it("flags a minimal_pair without phonemes", () => {
    const msg = only(errors(withSections((s) => { s[0].exercises[1] = pair(cpId("pron", 2), null); return s; })));
    expect(msg).toContain(`[${cpId("pron", 2)}]`);
    expect(msg).toMatch(/minimal_pair has no "phonemes"/);
  });
  it("flags any exercise of the pronunciation section without phonemes (a scored read_passage there)", () => {
    const msg = only(errors(withSections((s) => { s[0].exercises[2] = dictation(cpId("pron", 3)); return s; })));
    expect(msg).toMatch(/dictation has no "phonemes"/);
  });
  it("does not ask for phonemes outside the pronunciation section", () => {
    expect(errors(ctxOf())).toEqual([]);
  });
  it("flags a code that no lesson up to day A uses, listing the known codes", () => {
    const msg = only(errors(withSections((s) => { s[0].exercises[0] = pair(cpId("pron", 1), ["ae", "zz"]); return s; })));
    expect(msg).toContain(`[${cpId("pron", 1)}]`);
    expect(msg).toMatch(/phonemes code "zz" does not appear in days 1-30/);
    expect(msg).toContain("ae");
  });
  it("accepts a code that only an exercise's phonemes array (not a phoneme_intro) uses in a lesson", () => {
    const l5 = lessonFile(5, [], [{ ...pair("d005-pron-01", ["eh"]) }]);
    const ctx = ctxOf({ lessons: [...baseLessons(), l5], checkpoints: [checkpointFile({ sections: baseSections().map((s, i) => (i === 0 ? { ...s, exercises: [pair(cpId("pron", 1), ["eh"]), pair(cpId("pron", 2)), pair(cpId("pron", 3))] } : s)) })] });
    expect(errors(ctx)).toEqual([]);
  });
  it("a code taught only after day A is unknown", () => {
    const l31 = lessonFile(31, [], [{ id: "d031-pron-01", type: "phoneme_intro", instruction, phoneme: "th", ipa: "/θ/", tipTh: "ก", examples: ["x"] }]);
    const ctx = ctxOf({ lessons: [...baseLessons(), l31], checkpoints: [checkpointFile({ sections: baseSections().map((s, i) => (i === 0 ? { ...s, exercises: [pair(cpId("pron", 1), ["th"]), pair(cpId("pron", 2)), pair(cpId("pron", 3))] } : s)) })] });
    expect(only(errors(ctx))).toMatch(/code "th"/);
  });
});

describe("reviewDays (item 9)", () => {
  const withDays = (reviewDays: number[], lessons = baseLessons()) =>
    ctxOf({ lessons, checkpoints: [checkpointFile({ sections: baseSections().map((s, i) => (i === 3 ? { ...s, reviewDays } : s)) })] });
  it("accepts a day <= A that has a lesson with a section of the same skill", () => expect(errors(withDays([1]))).toEqual([]));
  it("flags a day after A", () => {
    expect(only(errors(withDays([31])))).toMatch(/reviewDays: day 31 is after day 30/);
  });
  it("flags a day with no lesson file", () => {
    expect(only(errors(withDays([5])))).toMatch(/reviewDays: day 5 has no lesson file/);
  });
  it("flags a lesson that has no section of the skill (day 30 here only has listening)", () => {
    expect(only(errors(withDays([30])))).toMatch(/reviewDays: day 30 has no "reading" section/);
  });
});

describe("the day-A lesson must exist (item 10)", () => {
  it("flags a missing day-030 lesson", () => {
    const ctx = ctxOf({ lessons: baseLessons().filter((l) => l.lesson.day !== 30) });
    expect(only(errors(ctx))).toMatch(/no lesson file for day 30.*content\/lessons\/day-030\.json.*never be unlocked/);
  });
});

describe("warnings (item 11)", () => {
  const intro = (day: number, phoneme: string) => lessonFile(day, [], [{ id: `d${String(day).padStart(3, "0")}-pron-01`, type: "phoneme_intro", instruction, phoneme, ipa: "/x/", tipTh: "ก", examples: ["x"] }]);
  it("warns about a sound taught in days A-29..A that no exercise is tagged with", () => {
    const w = only(warnings(ctxOf({ lessons: [...baseLessons(), intro(16, "th")] })));
    expect(w).toMatch(/phoneme "th" is taught on day 16.*no exercise.*"phonemes"/);
  });
  it("does not warn when the sound is tagged, or when it was taught before the 30 days", () => {
    expect(warnings(ctxOf({ lessons: [...baseLessons(), intro(16, "ae")] }))).toEqual([]);
    const lessons = [...baseLessons(), intro(2, "th"), lessonFile(60, [], [dictation("d060-listen-01", "Hello big cat.")])];
    const sections = baseSections().map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e, id: e.id.replace("c030", "c060") })) }));
    expect(warnings(ctxOf({ lessons, checkpoints: [checkpointFile({ afterDay: 60, sections })] }))).toEqual([]);
  });
  it("warns when an exercise repeats a lesson item's main text exactly (case, spacing and end punctuation ignored)", () => {
    const w = only(warnings(withSections((s) => { s[1].exercises[0] = dictation(cpId("listen", 1), "hello  BIG cat"); return s; })));
    expect(w).toContain(`[${cpId("listen", 1)}]`);
    expect(w).toMatch(/audioText.*same as d001-listen-01.*new sentence/);
  });
  it("covers text, answer and th, and ignores lessons after day A", () => {
    const lessons = [...baseLessons(), lessonFile(31, [], [dictation("d031-listen-01", "Big cat.")])];
    const s = baseSections();
    s[1].exercises[0] = dictation(cpId("listen", 1), "Big cat.");
    expect(warnings(ctxOf({ lessons, checkpoints: [checkpointFile({ sections: s })] }))).toEqual([]);
    s[4].exercises[0] = { id: cpId("write", 1), type: "translate_th_en", instruction, th: "สวัสดี", accept: ["Hello"] };
    const l1 = baseLessons();
    l1[0].lesson.sections[0].exercises.push({ id: "d001-write-09", type: "translate_th_en", instruction, th: "สวัสดี", accept: ["Hi"] });
    expect(warnings(ctxOf({ lessons: l1, checkpoints: [checkpointFile({ sections: s })] })).join("\n")).toMatch(/th.*same as d001-write-09/);
  });
  it.each([[19, true], [20, false], [45, false], [46, true]])("estimatedMinutes %i warning: %s", (m, warn) => {
    const w = warnings(ctxOf({ checkpoints: [checkpointFile({ estimatedMinutes: m })] }));
    if (warn) expect(only(w)).toMatch(new RegExp(`estimatedMinutes ${m} is outside 20-45`));
    else expect(w).toEqual([]);
  });
  it("warnings carry severity warning and errors do not", () => {
    const ctx = ctxOf({ checkpoints: [checkpointFile({ estimatedMinutes: 5 })] });
    expect(checkCheckpoints(ctx).every((p) => p.severity === "warning")).toBe(true);
    expect(checkCheckpoints(withSections((s) => s.slice(1))).some((p) => p.severity === undefined)).toBe(true);
  });
});

describe("world builder sanity", () => {
  it("world() wires lessons, vocab and the checkpoint", () => {
    const w = world();
    expect(w.checkpoints).toHaveLength(1);
    expect(w.lessons.map((l) => l.lesson.day)).toEqual([1, 30]);
  });
});

describe("reviewDays must be unique within a section", () => {
  it("flags a repeated day, naming it", () => {
    const ctx = withSections((s) => { s[0].reviewDays = [1, 1]; return s; });
    const msg = only(errors(ctx));
    expect(msg).toMatch(/reviewDays/);
    expect(msg).toContain("day 1 is listed twice");
  });
  it("accepts distinct days", () => {
    expect(errors(withSections((s) => { s[0].reviewDays = [1, 30]; return s; }))).toEqual([]);
  });
});
