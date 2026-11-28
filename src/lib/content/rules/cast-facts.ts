// Rule "cast-facts" (WARNING): a character's habit keeps one frequency adverb within a week (days 7k+1 .. 7k+7). Every week of
// the course so far had a contradiction (ages, colours, meals; in week 7 "Leo often/sometimes watches TV", "Dan often/always arrives early").
// A claim is: who + always|usually|often|sometimes|never + verb (+ the first noun after the verb), read from
//   "Leo sometimes watches TV"  /  "Sometimes Leo watches TV"  /  "Rose is never late" (verb "be", the adjective is the object)
// where who is a PROPER_NAMES name, he/she right after a sentence that names exactly one person, or I with a single "I am NAME"
// speaker or a "Name:" dialogue label. Verbs are made base forms (watches -> watch), the object head loses determiners, "to/at/in..."
// and a plural s. The same who + verb + object with two different adverbs in one week is one warning naming both places.
// Questions, negations ("does not often"), general statements ("People often ...") and everything else are not read.
// NOT detected (docs/FINDINGS.md): a frequency written after the verb ("Leo watches TV sometimes"), frequency phrases ("twice a week",
// "every day"), the same habit worded with a different verb or object (watch TV / watch a film), "they/we", a pronoun more than one
// sentence away from its name, and any contradiction across weeks.
import type { Problem } from "../loader";
import { PROPER_NAMES } from "./allowlists";
import type { RuleContext } from "./context";
import { learnerEnglish } from "./learner-text";

export const CAST_FACTS_RULE = "cast-facts";
export type FrequencyClaim = { who: string; adverb: string; verb: string; head: string; sentence: string };

const ADVERBS = "always|usually|often|sometimes|never";
const NAME = `(${PROPER_NAMES.join("|")})`;
const SUBJECT = String.raw`(${PROPER_NAMES.join("|")}|He|She|I)`;
const WITH_ADVERB_AFTER = new RegExp(String.raw`^${SUBJECT}\s+(${ADVERBS})\s+([A-Za-z]+)\b\s*(.*)$`);
const WITH_ADVERB_FIRST = new RegExp(String.raw`^(${ADVERBS})\s+${SUBJECT}\s+([A-Za-z]+)\b\s*(.*)$`, "i");
const BE_SENTENCE = new RegExp(String.raw`^${SUBJECT}\s+(?:is|are|am)\s+(${ADVERBS})\s+([A-Za-z]+)\s*$`);
const SPEAKER = new RegExp(String.raw`\b(?:I am|I'm|My name is|My name's)\s+${NAME}\b`, "g");
const LABEL = new RegExp(String.raw`^${NAME}:\s*`);
const NAME_G = new RegExp(String.raw`\b${NAME}\b`, "g");
const SKIP = new Set(["a", "an", "the", "my", "your", "his", "her", "our", "their", "some", "any", "to", "at", "in", "on", "for", "with", "by", "up", "of", "from", "about"]);

function baseVerb(verb: string, thirdPerson: boolean): string {
  const v = verb.toLowerCase();
  if (!thirdPerson) return v;
  if (v === "has") return "have";
  if (v === "is") return "be";
  if (v.endsWith("ies") && v.length > 4) return `${v.slice(0, -3)}y`;
  if (v.endsWith("es") && /(s|x|z|ch|sh|o)$/.test(v.slice(0, -2))) return v.slice(0, -2);
  if (v.endsWith("s") && !v.endsWith("ss")) return v.slice(0, -1);
  return v;
}

function objectHead(rest: string): string {
  const w = (rest.match(/[A-Za-z]+/g) ?? []).map((x) => x.toLowerCase()).find((x) => !SKIP.has(x));
  if (!w) return "";
  return w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}

export function frequencyClaims(text: string): FrequencyClaim[] {
  const raw = text.replace(/[’‘ʼ´`]/g, "'");
  const lines = raw.split("\n");
  const hasLabels = lines.some((l) => LABEL.test(l));
  const speakers = new Set([...raw.matchAll(SPEAKER)].map((m) => m[1]));
  const single = !hasLabels && speakers.size === 1 ? [...speakers][0] : undefined;
  const out: FrequencyClaim[] = [];
  for (const line of lines) {
    const label = LABEL.exec(line);
    const speaker = label ? label[1] : single;
    let previousNames = new Set<string>();
    for (const sentence of (label ? line.slice(label[0].length) : line).split(/(?<=[.!?])\s+/)) {
      const s = sentence.trim().replace(/[.!?]+$/, "");
      const names = new Set([...s.matchAll(NAME_G)].map((m) => m[1]));
      const prior = previousNames;
      previousNames = names;
      if (/\?\s*$/.test(sentence) || /\bnot\b|n't\b/i.test(s)) continue;
      let who: string | undefined, adverb: string | undefined, verb: string | undefined, rest = "", subject: string | undefined;
      let m = WITH_ADVERB_AFTER.exec(s);
      if (m) [, subject, adverb, verb, rest] = m;
      else if ((m = WITH_ADVERB_FIRST.exec(s))) [, adverb, subject, verb, rest] = [m[0], m[1], m[2], m[3], m[4]];
      let head = "";
      if (!m) {
        const b = BE_SENTENCE.exec(s);
        if (!b) continue;
        [, subject, adverb] = b;
        verb = "be";
        head = b[3].toLowerCase();
      }
      if (!subject || !adverb || !verb) continue;
      if (/^(?:He|She)$/.test(subject)) who = prior.size === 1 ? [...prior][0] : undefined;
      else if (subject === "I") who = speaker;
      else who = subject;
      if (!who) continue;
      const thirdPerson = subject !== "I";
      out.push({ who, adverb: adverb.toLowerCase(), verb: verb === "be" ? "be" : baseVerb(verb, thirdPerson), head: head || objectHead(rest), sentence: s });
    }
  }
  return out;
}

type Seen = FrequencyClaim & { file: string; id: string; where: string; day: number };

export function checkCastFacts(ctx: RuleContext): Problem[] {
  const seen = new Map<string, Seen[]>(); // `${week}|${who}|${verb}|${head}`
  const note = (day: number, file: string, id: string, where: string, text: string) => {
    for (const c of frequencyClaims(text)) {
      const key = `${Math.floor((day - 1) / 7)}|${c.who}|${c.verb}|${c.head}`;
      seen.set(key, [...(seen.get(key) ?? []), { ...c, file, id, where, day }]);
    }
  };
  for (const [id, { day }] of [...ctx.taughtIn].sort((a, b) => a[1].day - b[1].day)) {
    const entry = ctx.bank.get(id);
    entry?.item.examples.forEach((ex, i) => note(day, entry.file, id, `${entry.file} [${id}] examples[${i}]`, ex.en));
  }
  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        if (ex.type === "grammar_note") continue; // a card's examples teach the pattern, they are not facts about the cast
        for (const f of learnerEnglish(ex)) note(lesson.day, file, ex.id, `${file} [${ex.id}] ${f.field}`, f.text);
      }
    }
  }
  const problems: Problem[] = [];
  for (const [key, claims] of seen) {
    const first = claims[0];
    const differing = claims.filter((c) => c.adverb !== first.adverb);
    if (differing.length === 0) continue;
    const week = Math.floor((first.day - 1) / 7) * 7 + 1;
    const what = `${first.verb}${first.head ? ` ${first.head}` : ""}`;
    problems.push({
      rule: CAST_FACTS_RULE, file: differing[0].file, id: differing[0].id, severity: "warning",
      message: `"${first.who}" ${what} has two frequencies in days ${week}-${week + 6}: "${first.adverb}" in ${first.where} ("${first.sentence}") but ${differing.map((c) => `"${c.adverb}" in ${c.where} ("${c.sentence}")`).join("; ")}. Within one week a character's habit keeps one frequency adverb: change one of them.`,
    });
    void key;
  }
  return problems;
}
