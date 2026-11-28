// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkSoundWords, soundClaims } from "./sound-words";
import { data, exId, lessonFile, vocabFile, vocabItem } from "./test-support";

const word = (w: string, us: string, uk = us) => ({ ...vocabItem({ id: `v-${w}`, word: w }), ipa: { us, uk } });
const BANK = [
  word("five", "/faɪv/"), word("seven", "/ˈsevn/"), word("sixteen", "/ˌsɪksˈtiːn/"), word("seventeen", "/ˌsevnˈtiːn/"),
  word("water", "/ˈwɔːtər/", "/ˈwɔːtə(r)/"), word("this", "/ðɪs/"),
];
const repeat = (th: string, en?: string): Exercise => ({
  id: exId(1, "pron"), type: "repeat_after_me", instruction: { th, ...(en ? { en } : {}) }, text: "Five, seven.",
});
const intro = (th: string, tipTh: string): Exercise => ({
  id: exId(1, "pron", 2), type: "phoneme_intro", instruction: { th }, phoneme: "v", ipa: "/v/", tipTh, examples: ["five"],
});
const check = (exercises: Exercise[], items = BANK) => checkSoundWords(buildContext(data([lessonFile(1, [], exercises)], [vocabFile(items)])));

describe("soundClaims: '/x/ ใน w1, w2 และ w3' and '/x/ in w1, w2 and w3'", () => {
  it("reads the Thai list form (comma and และ), the incident sentence first", () => {
    expect(soundClaims("ฟังแล้วพูดตาม ระวังเสียง /v/ ใน five, seven, sixteen และ seventeen")).toEqual([{ symbol: "v", words: ["five", "seven", "sixteen", "seventeen"] }]);
  });
  it("reads the English form", () => {
    expect(soundClaims("Watch /v/ in five, seven and sixteen")).toEqual([{ symbol: "v", words: ["five", "seven", "sixteen"] }]);
    expect(soundClaims("Watch /v/ in five")).toEqual([{ symbol: "v", words: ["five"] }]);
  });
  it("reads several claims in one text, and stops a list at กับ / at the next symbol", () => {
    expect(soundClaims("แยก /w/ ใน we กับ /v/ ใน live และ very ให้ชัด")).toEqual([{ symbol: "w", words: ["we"] }, { symbol: "v", words: ["live", "very"] }]);
    expect(soundClaims("ระวัง /v/ ใน eleven, twelve และ /θ/ ใน thirteen")).toEqual([{ symbol: "v", words: ["eleven", "twelve"] }, { symbol: "θ", words: ["thirteen"] }]);
  });
  it("lower-cases words, ignores quotes, ignores a symbol that is not followed by 'ใน'/'in' and a list", () => {
    expect(soundClaims("เสียง /ð/ ใน 'This', “that”")).toEqual([{ symbol: "ð", words: ["this", "that"] }]);
    expect(soundClaims("เสียง /ɔː/ ฟังดูยาว")).toEqual([]);
    expect(soundClaims("Say /v/ in the word")).toEqual([]); // "in the ..." is a place, not a word list
  });
  it("skips a contrast: a sound named after 'ไม่ใช่' / 'ต่างจาก' / 'not' is a sound the word does NOT have", () => {
    expect(soundClaims("ออกเสียง /v/ ไม่ใช่ /w/ ใน five")).toEqual([]);
    expect(soundClaims("ต่างจาก /ɑː/ ใน hot")).toEqual([]);
    expect(soundClaims("Say /v/, not /w/ in five")).toEqual([]);
  });
});

describe("soundClaims: an English list stops at 'not' / 'unlike' (what the sound is NOT in)", () => {
  it("'/θ/ in three, not in this' and 'Watch /θ/ in three, not tree'", () => {
    expect(soundClaims("Say /θ/ in three, not in this")).toEqual([{ symbol: "θ", words: ["three"] }]);
    expect(soundClaims("Watch /θ/ in three, not tree")).toEqual([{ symbol: "θ", words: ["three"] }]);
    expect(soundClaims("Watch /θ/ in three and thank, unlike tree")).toEqual([{ symbol: "θ", words: ["three", "thank"] }]);
  });
});

describe("sound-words: real mistakes are caught, typing variants are not errors", () => {
  const bank = [word("happy", "/ˈhæpi/"), word("eight", "/eɪt/"), word("five", "/faɪv/"), word("this", "/ðɪs/"), word("mother", "/ˈmʌðər/"), word("car", "/kɑːr/"), word("good", "/ɡʊd/")];
  it.each([["/iː/", "happy"], ["/e/", "eight"], ["/ɪ/", "five"], ["/d/", "this"], ["/θ/", "mother"]])("%s in %s is an error", (sym, w) => {
    expect(check([repeat(`ระวัง ${sym} ใน ${w}`)], bank)).toHaveLength(1);
  });
  it.each([["/ɑ/", "car"], ["/g/", "good"], ["/ɹ/", "car"]])("%s in %s is fine", (sym, w) => {
    expect(check([repeat(`ระวัง ${sym} ใน ${w}`)], bank)).toEqual([]);
  });
});

describe("sound-words: every listed word that has a vocab entry must contain the named sound", () => {
  it("flags the incident: /v/ named for sixteen, which has no /v/", () => {
    const out = check([repeat("ฟังแล้วพูดตาม ระวังเสียง /v/ ใน five, seven, sixteen และ seventeen")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "sound-words", file: "content/lessons/day-001.json", id: "d001-pron-01" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain('"sixteen"');
    expect(out[0].message).toContain("/v/");
    expect(out[0].message).toContain("/ˌsɪksˈtiːn/");
    expect(out[0].message).not.toContain('"five"');
  });
  it("names every offending word, one problem per claim", () => {
    const out = check([repeat("ระวัง /v/ ใน five, sixteen และ this")]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('"sixteen"');
    expect(out[0].message).toContain('"this"');
  });
  it("accepts when US or UK IPA contains the sound as a whole phoneme", () => {
    expect(check([repeat("ระวัง /v/ ใน five, seven และ seventeen")])).toEqual([]);
    expect(check([repeat("Watch /r/ in water", "Watch /r/ in water")], [word("water", "/ˈwɔːtər/", "/ˈwɔːtə/")])).toEqual([]);
  });
  it("uses whole phonemes: /ɪ/ is not in 'five' (aɪ), /t/ is not in a tʃ word", () => {
    expect(check([repeat("ระวัง /ɪ/ ใน five")])).toHaveLength(1);
    expect(check([repeat("ระวัง /t/ ใน cheese")], [word("cheese", "/tʃiːz/")])).toHaveLength(1);
  });
  it("a word with no vocab entry is a WARNING saying it could not be checked", () => {
    const out = check([repeat("ระวัง /v/ ใน five และ grandfather")]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].message).toContain('"grandfather"');
    expect(out[0].message).toContain("could not be checked");
  });
  it("checks instruction.en and the phoneme_intro tip, for every exercise type", () => {
    expect(check([repeat("ฟังแล้วพูดตาม", "Watch /v/ in five and sixteen")])).toHaveLength(1);
    expect(check([intro("ฟังเสียง", "ระวัง /v/ ใน sixteen")])).toHaveLength(1);
  });
  it("a text without a claim is not checked", () => expect(check([repeat("ฟังแล้วพูดตาม")])).toEqual([]));
});

describe("sound-words: the sound must be in BOTH the US and the UK IPA", () => {
  const bank = [word("sandwich", "/ˈsænwɪtʃ/", "/ˈsænwɪdʒ/"), word("water", "/ˈwɔːtər/", "/ˈwɔːtə/"), word("sixteen", "/ˌsɪksˈtiːn/")];
  it("warns, naming the accent where it is missing, when only one accent has it", () => {
    const out = check([repeat("ระวังเสียง /tʃ/ ใน sandwich")], bank);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].message).toContain('"sandwich"');
    expect(out[0].message).toContain("UK");
    expect(out[0].message).toContain("/ˈsænwɪdʒ/");
    expect(out[0].message).toContain("US");
  });
  it("names the US when it is the US that lacks it", () => {
    const out = check([repeat("ระวังเสียง /dʒ/ ใน sandwich")], bank);
    expect(out[0].severity).toBe("warning");
    expect(out[0].message).toMatch(/only in the UK IPA/);
  });
  it("keeps the ERROR when the sound is in neither accent, and is quiet when both have it", () => {
    const out = check([repeat("ระวังเสียง /v/ ใน sixteen")], bank);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBeUndefined();
    expect(check([repeat("ระวังเสียง /t/ ใน water")], bank)).toEqual([]);
  });
});
