// @vitest-environment node
// Plan 3.1 item 6: the rules that look at learner-facing text run on a checkpoint as a unit of day afterDay.
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { checkAnswerForms } from "./answer-forms";
import { checkArrangeQuestion } from "./arrange-question";
import { checkArrangeWords } from "./arrange-words";
import { cpOf } from "./checkpoint-test-support";
import { buildContext } from "./context";
import { checkPronunciation } from "./pronunciation";
import { checkSoundWords } from "./sound-words";
import { checkThaiNames } from "./thai-names";
import { data, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const FILE = "content/checkpoints/checkpoint-030.json";
const BANK = [
  { ...vocabItem({ id: "v-water", word: "water" }), ipa: { us: "/ˈwɔːtər/", uk: "/ˈwɔːtə(r)/" } },
  vocabItem({ id: "v-baby", word: "baby" }), vocabItem({ id: "v-happy", word: "happy", pos: "adjective" }),
];
const ctx = (ex: Exercise) => buildContext({ ...data([lessonFile(1, [], [{ id: "d001-listen-01", type: "dictation", instruction, audioText: "Hi." }])], [vocabFile(BANK)]), checkpoints: [cpOf([ex])] });

describe("rules that must run on checkpoints", () => {
  it("pronunciation: ipa with a different number of words than the text", () => {
    const out = checkPronunciation(ctx({ id: "c030-pron-01", type: "repeat_after_me", instruction, text: "Hello big cat.", ipa: "/x/" }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "pronunciation", file: FILE, id: "c030-pron-01" });
  });
  it("sound-words: a sound claimed for a word that does not have it", () => {
    const out = checkSoundWords(ctx({ id: "c030-pron-01", type: "repeat_after_me", instruction: { th: "ก", en: "Watch /v/ in water" }, text: "Water." }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "sound-words", file: FILE, id: "c030-pron-01" });
  });
  it("arrange-words: a name that would be shown in lower case", () => {
    const out = checkArrangeWords(ctx({ id: "c030-write-01", type: "arrange_words", instruction, words: ["is", "Sam", "my", "friend"], answer: "Sam is my friend" }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "arrange-words", file: FILE, id: "c030-write-01" });
  });
  it("arrange-question: a statement whose yes/no question is not accepted", () => {
    const out = checkArrangeQuestion(ctx({ id: "c030-write-01", type: "arrange_words", instruction, words: ["My", "baby", "is", "very", "happy"], answer: "My baby is very happy" }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "arrange-question", file: FILE, id: "c030-write-01" });
  });
  it("answer-forms: an ambiguous contraction without its full form", () => {
    const out = checkAnswerForms(ctx({ id: "c030-write-01", type: "translate_th_en", instruction, th: "ก", accept: ["He's tired"] }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "answer-forms", file: FILE, id: "c030-write-01" });
  });
  it("thai-names: a Thai name misspelt next to its English name", () => {
    const out = checkThaiNames(ctx({ id: "c030-read-01", type: "translate_th_en", instruction, th: "นันอยู่ที่ไหน", accept: ["Where is Nan"] }));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toMatchObject({ rule: "thai-names", file: FILE, id: "c030-read-01", severity: "warning" });
  });
});
