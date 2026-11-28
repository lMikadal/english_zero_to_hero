// Rule "cast-consistency" (WARNING): the same character keeps one age within a week (days 7k+1 .. 7k+7).
// Detected, in learner-facing English and in the examples of vocab entries (read on the day the word is taught):
//   "Ann is thirteen" / "Ann's 13" / "Ben is 14 years old"          (a PROPER_NAMES name, is or 's, a number 1-120)
//   "I am Ann ... I am nineteen" / "My name is Sam. I'm 12"         (only when the text has exactly ONE speaker name)
// Warning, not error: two people can share a name, and a different week may legitimately change a character.
// NOT detected (also in docs/FINDINGS.md): ages written another way ("Ann has a birthday: she is ..."), "How old is
// Ann? She is ten" (needs a pronoun reference), ages across weeks, a name that is not in PROPER_NAMES, birth years,
// two speakers in one text.
import type { Problem } from "../loader";
import { NUMBER_WORDS } from "@/lib/answers/equivalents";
import { PROPER_NAMES } from "./allowlists";
import type { RuleContext } from "./context";
import { learnerEnglish } from "./learner-text";

export const CAST_RULE = "cast-consistency";
export type AgeClaim = { name: string; age: number; sentence: string };

const WORD_VALUE = new Map<string, number>(NUMBER_WORDS.filter(([, w]) => !w.includes(" ")).map(([d, w]) => [w, Number(d)]));
const UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const NUM = `(?:\\d{1,3}|(?:${TENS.join("|")})[- ](?:${UNITS.join("|")})|${[...WORD_VALUE.keys()].sort((a, b) => b.length - a.length).join("|")})`;
const NAME = `(${[...PROPER_NAMES].join("|")})`;
const TAIL = String.raw`(?:\s+years?\s+old)?(?=\s*(?:[.!?,;]|$)|\s+(?:and|but)\b)`;
const THIRD = new RegExp(String.raw`\b${NAME}(?:\s+is|'s)\s+(${NUM})${TAIL}`, "g");
const SPEAKER = new RegExp(String.raw`\b(?:I am|I'm|My name is|My name's)\s+${NAME}\b`, "g");
const FIRST = new RegExp(String.raw`\b(?:I am|I'm)\s+(${NUM})${TAIL}`, "g");

function value(num: string): number | undefined {
  if (/^\d+$/.test(num)) return Number(num) <= 120 ? Number(num) : undefined;
  const w = num.toLowerCase().replace(/ /g, "-");
  const direct = WORD_VALUE.get(w);
  if (direct !== undefined) return direct;
  const [t, u] = w.split("-");
  const ti = TENS.indexOf(t), ui = UNITS.indexOf(u);
  return ti >= 0 && ui >= 0 ? (ti + 2) * 10 + ui + 1 : undefined;
}

export function ageClaims(text: string): AgeClaim[] {
  const norm = text.replace(/[’‘ʼ´`]/g, "'");
  const out: AgeClaim[] = [];
  for (const m of norm.matchAll(THIRD)) {
    const age = value(m[2]);
    if (age !== undefined) out.push({ name: m[1], age, sentence: m[0].replace(/\s+years?\s+old$/, "") });
  }
  const speakers = new Set([...norm.matchAll(SPEAKER)].map((m) => m[1]));
  if (speakers.size === 1) {
    for (const m of norm.matchAll(FIRST)) {
      const age = value(m[1]);
      if (age !== undefined) out.push({ name: [...speakers][0], age, sentence: `I am ${m[1]}` });
    }
  }
  return out;
}

type Place = { file: string; id: string; where: string; day: number };
type Seen = Place & { age: number; sentence: string };

export function checkCast(ctx: RuleContext): Problem[] {
  const seen = new Map<string, Seen[]>(); // `${week}|${name}` -> claims in reading order
  const note = (day: number, place: Omit<Place, "day">, text: string) => {
    for (const c of ageClaims(text)) {
      const key = `${Math.floor((day - 1) / 7)}|${c.name}`;
      seen.set(key, [...(seen.get(key) ?? []), { ...place, day, age: c.age, sentence: c.sentence }]);
    }
  };
  for (const [id, { day }] of [...ctx.taughtIn].sort((a, b) => a[1].day - b[1].day)) {
    const entry = ctx.bank.get(id);
    entry?.item.examples.forEach((ex, i) => note(day, { file: entry.file, id, where: `${entry.file} [${id}] examples[${i}]` }, ex.en));
  }
  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        for (const f of learnerEnglish(ex)) note(lesson.day, { file, id: ex.id, where: `${file} [${ex.id}] ${f.field}` }, f.text);
      }
    }
  }
  const problems: Problem[] = [];
  for (const [key, claims] of seen) {
    const name = key.slice(key.indexOf("|") + 1);
    const first = claims[0];
    const differing = claims.filter((c) => c.age !== first.age);
    if (differing.length === 0) continue;
    const listed = differing.map((c) => `${c.age} in ${c.where} ("${c.sentence}")`).join("; ");
    problems.push({
      rule: CAST_RULE, file: differing[0].file, id: differing[0].id, severity: "warning",
      message: `"${name}" has two different ages in days ${Math.floor((first.day - 1) / 7) * 7 + 1}-${Math.floor((first.day - 1) / 7) * 7 + 7}: ${first.age} in ${first.where} ("${first.sentence}") but ${listed}. Within one week a character keeps one age: change one of them (or use another name if these are two different people).`,
    });
  }
  return problems;
}
