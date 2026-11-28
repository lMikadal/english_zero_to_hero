// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import type { LoadedLesson } from "../loader";
import { buildContext } from "./context";
import { GRAMMAR_NOT_BEFORE, GRAMMAR_STRUCTURES, checkGrammarNotYet, thirdPersonS } from "./grammar-not-yet";
import { cpOf } from "./checkpoint-test-support";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const say = (day: number, text: string, n = 1): Exercise => ({ id: exId(day, "speak", n), type: "repeat_after_me", instruction, text });
const passage = (day: number, text: string, glossary?: Record<string, string>): Exercise => ({
  id: exId(day, "read"), type: "read_passage", instruction, text, ...(glossary ? { glossary } : {}),
  questions: [{ question: { en: "Q?", th: "คำถาม" }, choices: ["a", "b"], answer: 0 }],
});
const verb = (word: string, pos = "verb") => ({ ...vocabItem({ id: `v-${word}${pos === "verb" ? "" : `-${pos}`}`, word, pos, examples: ["I do."] }) });
const BANK = [verb("thank"), verb("live"), verb("love"), verb("work"), verb("play", "noun"), verb("play"), verb("study"), verb("watch")];
const check = (lessons: LoadedLesson[], items = BANK) => checkGrammarNotYet(buildContext(data(lessons, [vocabFile(items)])));
const on = (day: number, ex: Exercise, vocab: string[] = []) => [lessonFile(day, vocab, [ex])];

describe("thirdPersonS", () => {
  it("spells the regular third-person -s", () => {
    expect(thirdPersonS("live")).toBe("lives");
    expect(thirdPersonS("work")).toBe("works");
    expect(thirdPersonS("watch")).toBe("watches");
    expect(thirdPersonS("study")).toBe("studies");
    expect(thirdPersonS("go")).toBe("goes");
    expect(thirdPersonS("play")).toBe("plays");
  });
});

describe("GRAMMAR_NOT_BEFORE (explicit table, first allowed day from docs/CURRICULUM.md)", () => {
  it("has/have is week 5 (day 29), Present Simple week 6 (day 36)", () => {
    expect(GRAMMAR_NOT_BEFORE.has).toMatchObject({ day: 29 });
    expect(GRAMMAR_NOT_BEFORE.does).toMatchObject({ day: 36 });
    expect(GRAMMAR_NOT_BEFORE.but).toMatchObject({ severity: "warning" });
  });
});

describe("telling the time (week 8, days 50-51)", () => {
  it("gates o'clock at day 50 and registers both week-8 structures", () => {
    expect(GRAMMAR_NOT_BEFORE["o'clock"]).toMatchObject({ structure: "clock-time", day: 50 });
    expect(GRAMMAR_STRUCTURES["clock-time"]).toMatchObject({ day: 50 });
    expect(GRAMMAR_STRUCTURES["time-prepositions"]).toMatchObject({ day: 51 });
  });
  it("flags o'clock on day 49 and is quiet on day 50", () => {
    const out = check(on(49, say(49, "It is seven o'clock.")));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("o'clock");
    expect(out[0].message).toContain("day 50");
    expect(check(on(50, say(50, "It is seven o'clock.")))).toEqual([]);
  });
});

describe("frequency adverbs (week 7, day 44)", () => {
  it("are gated at day 44 with their own structure", () => {
    for (const w of ["always", "usually", "often", "sometimes", "never"]) {
      expect(GRAMMAR_NOT_BEFORE[w]).toMatchObject({ structure: "frequency-adverb", day: 44 });
    }
    expect(GRAMMAR_STRUCTURES["frequency-adverb"]).toMatchObject({ day: 44 });
  });
  it("flags 'often' on day 43 and is quiet on day 44", () => {
    const out = check(on(43, say(43, "I often eat rice.")));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('"often"');
    expect(out[0].message).toContain("day 44");
    expect(check(on(44, say(44, "I often eat rice. She never cooks.")))).toEqual([]);
  });
});

describe("grammar-not-yet: forms that need a grammar point not yet taught", () => {
  it("flags 'lives' on day 15 even though 'live' is taught: a third-person -s form is the Present Simple week (the incident)", () => {
    const out = check(on(15, say(15, "My mother lives in Bangkok."), ["v-live"]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "grammar-not-yet", file: "content/lessons/day-015.json", id: "d015-speak-01" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain('"lives"');
    expect(out[0].message).toContain('"live"');
    expect(out[0].message).toContain("day 36");
    expect(out[0].message).toContain("day 15");
    expect(out[0].message).toContain("glossary");
  });
  it("flags loves, works, and an irregular table form", () => {
    expect(check(on(20, say(20, "She loves a cat."))).map((p) => p.message).join()).toContain('"loves"');
    expect(check(on(20, say(20, "He works here."))).length).toBe(1);
    const has = check(on(20, say(20, "She has a cat.")));
    expect(has).toHaveLength(1);
    expect(has[0].message).toContain("day 29");
    expect(check(on(20, say(20, "Does she live here?"))).map((p) => p.message).join()).toContain('"does"');
  });
  it("is quiet from the first allowed day", () => {
    expect(check(on(36, say(36, "My mother lives in Bangkok. She does work.")))).toEqual([]);
    expect(check(on(29, say(29, "She has a cat.")))).toEqual([]);
  });
  it("is quiet when the exercise's glossary explains the form", () => {
    expect(check(on(15, passage(15, "My mother lives in Bangkok.", { lives: "อาศัยอยู่" })))).toEqual([]);
    expect(check(on(15, passage(15, "My mother lives in Bangkok.", { other: "อื่น" })))).toHaveLength(1);
  });
  it("does not flag the base form, plurals of nouns, or a possessive 's", () => {
    expect(check(on(15, say(15, "I live and we work. Sam's cat is here.")))).toEqual([]);
    expect(check(on(15, say(15, "They are my friends. Those are cats.")))).toEqual([]);
  });
  it("skips a form after a determiner or number (noun reading: 'their lives', 'two works')", () => {
    expect(check(on(15, say(15, "Their lives are good. I love my two works.")))).toEqual([]);
  });
  it("does not generate a form for a word that is also a noun entry (plays, works as nouns)", () => {
    expect(check(on(15, say(15, "He plays here.")))).toEqual([]);
  });
  it("'but' is only a WARNING (its day is not in the curriculum)", () => {
    const out = check(on(15, say(15, "I am small but happy.")));
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].message).toContain('"but"');
  });
  it("does not check sound drills or bilingual question texts", () => {
    const pair: Exercise = { id: exId(15, "pron"), type: "minimal_pair", instruction, pairs: [{ a: "but", b: "bat", answer: "a" }] };
    expect(check(on(15, pair))).toEqual([]);
    const lc: Exercise = { id: exId(15, "listen"), type: "listen_choose", instruction, audioText: "Hello.", question: { en: "What does Ann say?", th: "แอนพูดว่าอะไร" }, choices: ["Hi", "Bye"], answer: 0 };
    expect(check(on(15, lc))).toEqual([]);
  });
  it("checks the examples of a vocab entry on the day it is taught", () => {
    const item = { ...vocabItem({ id: "v-cat", word: "cat" }), examples: [{ en: "She has a cat.", th: "เธอมีแมว" }] };
    const out = check(on(15, say(15, "Hello.", 1), ["v-cat"]), [item]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "v-cat", file: "content/vocab/oxford-3000/a1.json" });
  });
});

describe("grammar-not-yet: interjections and words that are words in their own right are never a third-person form", () => {
  it("'Thanks' is not the third-person -s of 'thank' (day 2 'Fine, thanks', 'Thanks, Tom!', 'Thanks a lot.')", () => {
    for (const t of ["Fine, thanks", "Thanks, Tom!", "Thanks a lot.", "Hello! Thanks."]) expect(check(on(2, say(2, t))), t).toEqual([]);
  });
  it("a form that is itself a bank word (an exclamation, a noun) is not generated either", () => {
    const withEntry = [...BANK, { ...vocabItem({ id: "v-thanks", word: "thanks", pos: "exclamation" }) }, verb("show"), vocabItem({ id: "v-shows", word: "shows", pos: "noun" })];
    expect(check(on(2, say(2, "Thanks. Two shows.")), withEntry)).toEqual([]);
    expect(check(on(2, say(2, "Thank you."), ["v-thank"]), withEntry)).toEqual([]);
  });
});

describe("grammar-not-yet: negative do-support (do not / don't) is Present Simple week", () => {
  it("flags 'do not' and \"don't\" before day 36 with correct advice, allows them from day 36", () => {
    for (const t of ["I do not know.", "I don't know.", "We don't like tea", "They do not live here"]) {
      const out = check(on(15, say(15, t)));
      expect(out, t).toHaveLength(1);
      expect(out[0].message).toContain('"do not"');
      expect(out[0].message).toContain("day 36");
      expect(out[0].message).toContain("am not");
    }
    expect(check(on(36, say(36, "I don't know. We do not live here.")))).toEqual([]);
  });
  it("keeps 'Do you ...?' questions and 'How do you spell it' allowed (day 5)", () => {
    for (const t of ["Do you spell it?", "How do you spell it", "What do you do?", "Do I know you?", "Yes, I do.", "No, I do."]) expect(check(on(5, say(5, t))), t).toEqual([]);
  });
  it("'is not' / 'am not' are untouched", () => {
    expect(check(on(11, say(11, "I am not a doctor. It is not a door. They are not here.")))).toEqual([]);
  });
});

describe("grammar-not-yet: every learner-facing English field of every exercise type is read (the gated word 'has' is planted in each)", () => {
  const T = "She has a cat";
  const lc = (over: Partial<Exercise> = {}) => ({ id: exId(20, "listen"), type: "listen_choose", instruction, audioText: "Hello.", question: { en: "Q?", th: "ค" }, choices: ["a", "b"], answer: 0, ...over }) as Exercise;
  const cases: [string, Exercise, string][] = [
    ["repeat_after_me.text", { id: exId(20, "speak"), type: "repeat_after_me", instruction, text: T }, "text"],
    ["listen_choose.audioText", lc({ audioText: T } as never), "audioText"],
    ["listen_choose.choices", lc({ choices: [T, "b"] } as never), "choices[0]"],
    ["dictation.audioText", { id: exId(20, "listen", 2), type: "dictation", instruction, audioText: T }, "audioText"],
    ["shadowing.lines", { id: exId(20, "speak", 2), type: "shadowing", instruction, lines: ["Hello.", T] }, "lines[1]"],
    ["speak_answer.prompt", { id: exId(20, "speak", 3), type: "speak_answer", instruction, prompt: T, sampleAnswer: "Hi." } as Exercise, "prompt"],
    ["speak_answer.sampleAnswer", { id: exId(20, "speak", 3), type: "speak_answer", instruction, prompt: "Hi.", sampleAnswer: T } as Exercise, "sampleAnswer"],
    ["read_passage.text", passage(20, T), "text"],
    ["read_passage.choices", { ...passage(20, "Hi."), questions: [{ question: { en: "Q?", th: "ค" }, choices: [T, "b"], answer: 0 }] } as Exercise, "questions[0].choices[0]"],
    ["arrange_words.answer", { id: exId(20, "write"), type: "arrange_words", instruction, words: ["She", "has"], answer: T } as Exercise, "answer"],
    ["fill_blank.text", { id: exId(20, "write", 2), type: "fill_blank", instruction, text: "She has ___", answer: ["a cat"] } as Exercise, "text"],
    ["fill_blank.answer", { id: exId(20, "write", 2), type: "fill_blank", instruction, text: "She ___ a cat", answer: ["has"] } as Exercise, "answer[0]"],
    ["translate_th_en.accept[0]", { id: exId(20, "write", 3), type: "translate_th_en", instruction, th: "ก", accept: [T] } as Exercise, "accept[0]"],
    // dictation.accept, arrange_words.accept and translate_th_en.accept[1..] are exempt from every gate (see the next describe): they are never shown as a model
  ];
  it.each(cases)("%s", (_name, ex, field) => {
    const out = check(on(20, ex));
    expect(out, field).toHaveLength(1);
    expect(out[0].message).toContain(field);
    expect(out[0].message).toContain('"has"');
  });
});

describe("checkGrammarNotYet: checkpoints are checked as a unit of day afterDay", () => {
  const cp = (text: string, afterDay = 30) => cpOf([{ id: `c${String(afterDay).padStart(3, "0")}-speak-01`, type: "repeat_after_me", instruction, text }], afterDay);
  const go = (checkpoint: ReturnType<typeof cp>) =>
    checkGrammarNotYet(buildContext({ ...data([lessonFile(1, ["v-live"], [say(1, "I live.")])], [vocabFile(BANK)]), checkpoints: [checkpoint] }));

  it("flags third-person -s (day 36) in a checkpoint after day 30", () => {
    const out = go(cp("Ann lives here."));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "grammar-not-yet", file: "content/checkpoints/checkpoint-030.json", id: "c030-speak-01" });
    expect(out[0].message).toContain("day 30");
    expect(out[0].message).toContain("lives");
  });
  it("accepts has (day 29 <= 30)", () => expect(go(cp("Ann has a cat."))).toEqual([]));
  it("accepts -s in a checkpoint after day 60", () => expect(go(cp("Ann lives here.", 60))).toEqual([]));
});

describe("present continuous (week 10, day 64): am / is / are + -ing", () => {
  const dict = (day: number, audioText: string, accept: string[]): Exercise => ({ id: exId(day, "listen", 2), type: "dictation", instruction, audioText, accept });
  it("registers both structures: the statement on day 64, questions and negatives on day 65", () => {
    expect(GRAMMAR_STRUCTURES["present-continuous"]).toMatchObject({ day: 64 });
    expect(GRAMMAR_STRUCTURES["continuous-question"]).toMatchObject({ day: 65 });
    expect(GRAMMAR_NOT_BEFORE.raining).toMatchObject({ structure: "present-continuous", day: 64 });
  });
  it("flags be + -ing before day 64 and is quiet from day 64", () => {
    for (const t of ["She is working here.", "I am studying.", "We are watching a film.", "He is not working.", "It's raining.", "It is raining today."]) {
      const out = check(on(63, say(63, t)));
      expect(out, t).toHaveLength(1);
      expect(out[0].message).toContain("day 64");
      expect(out[0].message).toContain("day 63");
    }
    expect(check(on(64, say(64, "She is working. I am studying. It is raining.")))).toEqual([]);
  });
  it("is quiet without a form of be before the -ing word (gerunds, nouns, 'I like swimming')", () => {
    expect(check(on(20, say(20, "I like working. Working is good. The study is good.")))).toEqual([]);
  });
  it("an -ing form that is a bank word of its own (morning, shopping) is never gated, even after be", () => {
    const withEntry = [...BANK, vocabItem({ id: "v-morning", word: "morning", pos: "noun" }), verb("shop"), vocabItem({ id: "v-shopping", word: "shopping", pos: "noun" })];
    expect(check(on(20, say(20, "It is morning. It is shopping time.")), withEntry)).toEqual([]);
  });
  it("accepts the continuous in an extra accepted answer (a learner who knows it is not marked wrong) but not in the shown text", () => {
    expect(check(on(58, dict(58, "It is rainy today", ["It is rainy today", "It is raining today"])))).toEqual([]);
    expect(check(on(58, dict(58, "It is raining today", [])))).toHaveLength(1);
  });
});

describe("extra accepted answers are exempt from every grammar gate; the model answer is not", () => {
  const tr = (day: number, accept: string[]): Exercise => ({ id: exId(day, "write", 3), type: "translate_th_en", instruction, th: "ก", accept } as Exercise);
  const dict = (day: number, audioText: string, accept: string[]): Exercise => ({ id: exId(day, "listen", 2), type: "dictation", instruction, audioText, accept });
  const arr = (day: number, answer: string, accept: string[]): Exercise => ({ id: exId(day, "write"), type: "arrange_words", instruction, words: ["a", "b"], answer, accept } as Exercise);
  const FORMS = ["She has a cat", "The bag costs ninety baht", "He doesn't work", "She is working"];
  it("(a) an extra accept with has / costs / does not / the continuous on an early day is no error", () => {
    const bank = [...BANK, verb("cost")];
    for (const t of FORMS) {
      expect(check(on(20, tr(20, ["I have a cat", t])), bank), t).toEqual([]);
      expect(check(on(20, dict(20, "I have a cat", [t])), bank), t).toEqual([]);
      expect(check(on(20, arr(20, "I have a cat", [t])), bank), t).toEqual([]);
    }
  });
  it("(b) the same form as the model answer is an error", () => {
    const bank = [...BANK, verb("cost")];
    for (const t of FORMS) {
      expect(check(on(20, tr(20, [t, "I have a cat"])), bank), t).toHaveLength(1);
      expect(check(on(20, dict(20, t, [])), bank), t).toHaveLength(1);
      expect(check(on(20, arr(20, t, [])), bank), t).toHaveLength(1);
    }
  });
  it("(c) a checkpoint's extra accept with a gated form is no error, its model answer is", () => {
    const cp = (accept: string[]) => cpOf([{ id: "c030-write-01", type: "translate_th_en", instruction, th: "ก", accept } as Exercise], 30);
    const go = (c: ReturnType<typeof cp>) => checkGrammarNotYet(buildContext({ ...data([lessonFile(1, ["v-live"], [say(1, "I live.")])], [vocabFile(BANK)]), checkpoints: [c] }));
    expect(go(cp(["Ann is here", "Ann lives here"]))).toEqual([]);
    expect(go(cp(["Ann lives here", "Ann is here"]))).toHaveLength(1);
  });
});

describe("Past Simple (week 11): was / were day 71, regular -ed day 72, did / didn't day 73; irregular past forms are week 12", () => {
  const bank = [...BANK, verb("walk"), verb("play"), verb("stop"), verb("study"), verb("like"), verb("wait"), verb("visit"), verb("see"), verb("go"), verb("put"), verb("read"), vocabItem({ id: "v-tired", word: "tired", pos: "adjective" })];
  const at = (day: number, t: string) => check(on(day, say(day, t)), bank);
  it("registers the four structures with their first day", () => {
    expect(GRAMMAR_STRUCTURES["past-be"]).toMatchObject({ day: 71 });
    expect(GRAMMAR_STRUCTURES["past-regular"]).toMatchObject({ day: 72 });
    expect(GRAMMAR_STRUCTURES["past-did"]).toMatchObject({ day: 73 });
    expect(GRAMMAR_STRUCTURES["past-irregular"]).toMatchObject({ day: 78 });
  });
  it("was / were / wasn't / weren't are gated at day 71", () => {
    for (const t of ["I was at home.", "We were happy.", "She wasn't here.", "They weren't busy."]) {
      expect(at(70, t), t).toHaveLength(1);
      expect(at(70, t)[0].message).toContain("day 71");
      expect(at(71, t), t).toEqual([]);
    }
  });
  it("the regular -ed form of every bank verb is gated at day 72 (spelling rules: stopped, played, studied, liked, waited, visited)", () => {
    for (const t of ["We walked home.", "I played football.", "He stopped.", "She studied.", "We liked it.", "I waited.", "They visited Mali."]) {
      expect(at(71, t), t).toHaveLength(1);
      expect(at(71, t)[0].message).toContain("day 72");
      expect(at(72, t), t).toEqual([]);
    }
  });
  it("an adjective of the bank (tired) and the base form are not gated", () => {
    expect(at(60, "I am tired. We walk and play.")).toEqual([]);
  });
  it("did / didn't are gated at day 73", () => {
    for (const t of ["Did you walk?", "I didn't walk.", "She did not play."]) {
      expect(at(72, t), t).toHaveLength(1);
      expect(at(72, t)[0].message).toContain("day 73");
      expect(at(73, t), t).toEqual([]);
    }
  });
  it("irregular past forms (went, saw, bought, had, ...) are gated until day 78; put / read / left are not", () => {
    for (const t of ["We went home.", "I saw Leo.", "She bought a bag.", "He had a cat.", "They ate rice.", "I took the bus."]) {
      expect(at(77, t), t).toHaveLength(1);
      expect(at(77, t)[0].message).toContain("day 78");
      expect(at(78, t), t).toEqual([]);
    }
    expect(at(60, "Put it here. Turn left. I read a book.")).toEqual([]);
  });
  it("an extra accepted answer may use any of them; the model answer may not", () => {
    const dict = (audioText: string, accept: string[]): Exercise => ({ id: exId(70, "listen", 2), type: "dictation", instruction, audioText, accept });
    expect(check(on(70, dict("I walk home", ["I walked home", "I went home", "I was there", "Did you walk"])), bank)).toEqual([]);
    expect(check(on(70, dict("I walked home", [])), bank)).toHaveLength(1);
  });
});
