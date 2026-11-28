// Rule "cast-props" (WARNING): a character's thing keeps one colour within a week (days 7k+1 .. 7k+7). Read, in learner-facing
// English and in vocab examples (on the day the word is taught):
//   "Nan's umbrella is orange"                 (NAME's NOUN is COLOUR)
//   "Nan has a green umbrella"                 (NAME has ... a COLOUR NOUN, also a list: "a red bag, a blue pen and an orange umbrella")
//   "I am Nan. I have a green umbrella"        (I have ..., owner = the single "I am NAME" speaker, or the label "Nan:" of a dialogue line)
//   "My bag is brown" / "My pink bag is new"   (My NOUN is COLOUR / My COLOUR NOUN, same speaker rule)
// Colours: COLOUR_WORDS, the closed list of the colour words of the vocab bank (grey and gray are one). Warning, not error:
// a character may buy a new bag (day 26) and two people can share a name. An owner who has several things of the same
// noun in ONE sentence ("Nan has a brown dog and a white dog") has two things, so that owner+noun is not compared. NOT detected (docs/FINDINGS.md): "It is orange"
// after "I have an umbrella", "Her/His NOUN is COLOUR" (needs a pronoun reference), plurals vs singular owners ("The chairs
// are white"), nouns with an adjective in between ("Nan's big bag is red"), colours in a question, a thing owned by "we".
import { foldSpelling } from "@/lib/answers/spelling";
import type { Problem } from "../loader";
import { PROPER_NAMES } from "./allowlists";
import type { RuleContext } from "./context";
import { learnerEnglish } from "./learner-text";

export const CAST_PROPS_RULE = "cast-props";

/** The colour words of the vocab bank (a test checks each is an entry), plus the US spelling of grey. */
export const COLOUR_WORDS: readonly string[] = ["red", "blue", "green", "yellow", "black", "white", "brown", "orange", "pink", "grey", "gray"];

export type PropClaim = { owner: string; noun: string; colour: string; sentence: string };

const COLOUR = `(${COLOUR_WORDS.join("|")})`;
const NAME = `(${PROPER_NAMES.join("|")})`;
const NOUN = String.raw`([a-z]+)`;
const NOT_A_NOUN = new Set(["and", "or", "too", "in", "on", "at", "is", "are", "it", "baht"]);
const ITEM = new RegExp(String.raw`\b(?:a|an|the|two|three|four|five|my)\s+${COLOUR}\s+${NOUN}\b`, "g");
const OWNED = new RegExp(String.raw`\b${NAME}'s\s+${NOUN}\s+(?:is|are)\s+${COLOUR}\b`, "g");
/** A list of things ends where the next owner starts ("... a red bag and Rose has a blue bag", "..., and Rose a blue bag") or at the end of the sentence. */
const UNTIL_NEXT_OWNER = String.raw`(.*?)(?=,?\s+(?:and\s+)?${NAME}\b|$)`;
const HAS = new RegExp(String.raw`\b${NAME}\s+has\s+${UNTIL_NEXT_OWNER}`, "g");
const I_HAVE = new RegExp(String.raw`\bI have\s+${UNTIL_NEXT_OWNER}`);
const MY_IS = new RegExp(String.raw`\bMy\s+${NOUN}\s+(?:is|are)\s+${COLOUR}\b`);
const MY_COLOUR = new RegExp(String.raw`\bMy\s+${COLOUR}\s+${NOUN}\b`);
const SPEAKER = new RegExp(String.raw`\b(?:I am|I'm|My name is|My name's)\s+${NAME}\b`, "g");
const LABEL = new RegExp(String.raw`^${NAME}:\s*`);

const colour = (c: string) => foldSpelling(c.toLowerCase());
const noun = (n: string) => (n.length > 3 && n.endsWith("s") && !n.endsWith("ss") ? n.slice(0, -1) : n);

export function propClaims(text: string): PropClaim[] {
  const raw = text.replace(/[’‘ʼ´`]/g, "'");
  const lines = raw.split("\n");
  const hasLabels = lines.some((l) => LABEL.test(l));
  const speakers = new Set([...raw.matchAll(SPEAKER)].map((m) => m[1]));
  const single = !hasLabels && speakers.size === 1 ? [...speakers][0] : undefined;
  const out: PropClaim[] = [];
  const add = (owner: string, n: string, c: string, sentence: string) => {
    if (!NOT_A_NOUN.has(n)) out.push({ owner, noun: noun(n), colour: colour(c), sentence });
  };
  const items = (owner: string, rest: string, sentence: string) => {
    for (const m of rest.matchAll(ITEM)) add(owner, m[2], m[1], sentence);
  };
  for (const line of lines) {
    const label = LABEL.exec(line);
    const speaker = label ? label[1] : single;
    for (const sentence of (label ? line.slice(label[0].length) : line).split(/(?<=[.!?])\s+/)) {
      const s = sentence.trim().replace(/[.!?]+$/, "");
      for (const m of s.matchAll(OWNED)) add(m[1], m[2], m[3], m[0]);
      const have = speaker ? I_HAVE.exec(s) : null;
      if (speaker && have) items(speaker, have[1], s);
      for (const has of s.matchAll(HAS)) items(has[1], has[2], s);
      if (!speaker) continue;
      const my = MY_IS.exec(s);
      if (my) add(speaker, my[1], my[2], my[0]);
      const myc = MY_COLOUR.exec(s);
      if (myc) add(speaker, myc[2], myc[1], myc[0]);
    }
  }
  return out;
}

type Seen = PropClaim & { file: string; id: string; where: string; day: number };

export function checkCastProps(ctx: RuleContext): Problem[] {
  const seen = new Map<string, Seen[]>(); // `${week}|${owner}|${noun}`
  const note = (day: number, file: string, id: string, where: string, text: string) => {
    for (const c of propClaims(text)) {
      const key = `${Math.floor((day - 1) / 7)}|${c.owner}|${c.noun}`;
      seen.set(key, [...(seen.get(key) ?? []), { ...c, file, id, where, day }]);
    }
  };
  for (const [id, { day }] of [...ctx.taughtIn].sort((a, b) => a[1].day - b[1].day)) {
    const entry = ctx.bank.get(id);
    entry?.item.examples.forEach((ex, i) => note(day, entry.file, id, `${entry.file} [${id}] examples[${i}]`, ex.en));
  }
  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) for (const f of learnerEnglish(ex)) note(lesson.day, file, ex.id, `${file} [${ex.id}] ${f.field}`, f.text);
    }
  }
  const problems: Problem[] = [];
  for (const [key, claims] of seen) {
    const [, owner, n] = key.split("|");
    if (claims.some((a) => claims.some((b) => a !== b && a.sentence === b.sentence && a.where === b.where && a.colour !== b.colour))) continue; // two things of the same noun
    const first = claims[0];
    const differing = claims.filter((c) => c.colour !== first.colour);
    if (differing.length === 0) continue;
    const week = Math.floor((first.day - 1) / 7) * 7 + 1;
    problems.push({
      rule: CAST_PROPS_RULE, file: differing[0].file, id: differing[0].id, severity: "warning",
      message: `"${owner}"'s ${n} has two colours in days ${week}-${week + 6}: ${first.colour} in ${first.where} ("${first.sentence}") but ${differing.map((c) => `${c.colour} in ${c.where} ("${c.sentence}")`).join("; ")}. Within one week a character's thing keeps its colour: change one of them (or use another noun or name if these are different things).`,
    });
  }
  return problems;
}
