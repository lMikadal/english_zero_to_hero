// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkMinimalPairAccents } from "./minimal-pair-accents";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const w = (word: string, us: string, uk = us) => ({ ...vocabItem({ id: `v-${word}`, word }), ipa: { us, uk } });
const pair = (a: string, b: string, n = 1): Exercise => ({ id: exId(1, "pron", n), type: "minimal_pair", instruction, pairs: [{ a, b, answer: "a" }] });
const run = (ex: Exercise, items: ReturnType<typeof w>[]) => checkMinimalPairAccents(buildContext(data([lessonFile(1, [], [ex])], [vocabFile(items)])));

describe("minimal-pair-accents (warning): a pair differs by exactly one sound in the US IPA AND the UK IPA", () => {
  it("flags fast-fat: one sound in US, two in UK (the incident), naming both IPAs and the accent", () => {
    const out = run(pair("fat", "fast"), [w("fat", "/fæt/"), w("fast", "/fæst/", "/fɑːst/")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "minimal-pair-accents", severity: "warning", file: "content/lessons/day-001.json", id: "d001-pron-01" });
    for (const t of ['"fat"', '"fast"', "UK", "/fæt/", "/fɑːst/", "exactly one sound", "pairs[0]"]) expect(out[0].message).toContain(t);
    expect(out[0].message).not.toContain("US IPA (");
  });
  it("accepts wet-west (one deletion) and bad-bed (one substitution) in both accents", () => {
    expect(run(pair("wet", "west"), [w("wet", "/wet/"), w("west", "/west/")])).toEqual([]);
    expect(run(pair("bad", "bed"), [w("bad", "/bæd/"), w("bed", "/bed/")])).toEqual([]);
  });
  it("flags two sounds in both accents, and a pair that is the same in one accent (zero sounds)", () => {
    expect(run(pair("cat", "dog"), [w("cat", "/kæt/"), w("dog", "/dɒɡ/")])).toHaveLength(1);
    expect(run(pair("tomato", "tomatoes"), [w("tomato", "/təˈmɑːtoʊ/", "/təˈmɑːtəʊ/"), w("tomatoes", "/təˈmɑːtoʊz/", "/təˈmɑːtəʊz/")])).toEqual([]);
  });
  it("counts an r-coloured vowel as ONE sound (US work-walk, bird-bed are one substitution), but not r before a vowel", () => {
    expect(run(pair("work", "walk"), [w("work", "/wɜːrk/", "/wɜːk/"), w("walk", "/wɔːk/")])).toEqual([]);
    expect(run(pair("bird", "bed"), [w("bird", "/bɜːrd/", "/bɜːd/"), w("bed", "/bed/")])).toEqual([]);
    expect(run(pair("very", "vary"), [w("very", "/ˈveri/"), w("vary", "/ˈveəri/", "/ˈveəri/")])).toEqual([]);
    expect(run(pair("read", "ready"), [w("read", "/riːd/"), w("ready", "/ˈredi/")])).toHaveLength(1);
  });
  it("skips silently when either word has no vocab entry", () => {
    expect(run(pair("fat", "fast"), [w("fat", "/fæt/")])).toEqual([]);
    expect(run(pair("worth", "worse"), [])).toEqual([]);
  });
  it("tokenises whole phonemes (tʃ and aɪ count once), ignores stress marks and the optional (r)", () => {
    expect(run(pair("chin", "shin"), [w("chin", "/tʃɪn/"), w("shin", "/ʃɪn/")])).toEqual([]);
    expect(run(pair("car", "cart"), [w("car", "/kɑːr/", "/kɑː(r)/"), w("cart", "/kɑːrt/", "/kɑːt/")])).toEqual([]);
    expect(run(pair("five", "fife"), [w("five", "/faɪv/"), w("fife", "/faɪf/")])).toEqual([]);
  });
});
