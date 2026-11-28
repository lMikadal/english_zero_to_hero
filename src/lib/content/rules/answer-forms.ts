// Rule "answer-forms": closes the traps of the grade-time folding (src/lib/answers/equivalents.ts). The folding is safe
// only where an expression has ONE reading. Where it cannot fold (ambiguous 's, 'd, Name's, ordinals, big numbers, zero),
// the author must either list every spelling the learner may type, or set `strict: true` on the item (which turns
// the folding off and says "only this spelling"). Checked for typed accepted answers of dictation, translate_th_en and fill_blank.
import { CONTRACTIONS, NUMBER_WORDS, S_BASES, isParticipleLike, isSForm } from "@/lib/answers/equivalents";
import { normalizeAnswer } from "@/lib/answers/normalize";
import type { Problem } from "../loader";
import type { Exercise } from "../schema";
import { PROPER_NAMES } from "./allowlists";
import type { RuleContext } from "./context";

export const ANSWER_FORMS_RULE = "answer-forms";

const UNIT_ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth",
  "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
const TENS_ORD = ["twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth"];
const TENS_CARD = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const suffix = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th"));
const ORDINALS: [string, string][] = [];
for (let n = 1; n <= 19; n++) ORDINALS.push([UNIT_ORD[n - 1], `${n}${suffix(n)}`]);
for (let t = 0; t < 8; t++) {
  ORDINALS.push([TENS_ORD[t], `${(t + 2) * 10}th`]);
  for (let u = 1; u <= 9; u++) ORDINALS.push([`${TENS_CARD[t]}-${UNIT_ORD[u - 1]}`, `${(t + 2) * 10 + u}${suffix(u)}`]);
}
ORDINALS.push(["hundredth", "100th"]);
/** "twenty first" and "twenty-first" are one spelling for this rule. */
const joinOrdinals = (s: string) => s.replace(new RegExp(`\\b(${TENS_CARD.join("|")}) (${UNIT_ORD.slice(0, 9).join("|")})\\b`, "g"), "$1-$2");
const COUNTERPART = new Map<string, string>([
  ...ORDINALS.flatMap(([w, d]) => [[w, d], [d, w]] as [string, string][]),
  ["zero", "0"], ["0", "zero"],
]);
const NAMES = new Set(PROPER_NAMES.map((n) => n.toLowerCase()));
const CONTRACTED_KEYS = new Set(CONTRACTIONS.map(([c]) => c));

/** What a fill_blank answer must not silently be: a contraction, its full form, or a number in digits or words. */
const FOLDABLE = new Set<string>([
  ...CONTRACTIONS.flatMap(([c, f]) => [c, f]),
  ...NUMBER_WORDS.flatMap(([d, w]) => [d, w]),
  "hundred", "a hundred",
]);
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
for (let t = 0; t < TENS.length; t++) for (let u = 0; u < UNITS.length; u++) FOLDABLE.add(`${t + 2}${u + 1}`).add(`${TENS[t]}-${UNITS[u]}`).add(`${TENS[t]} ${UNITS[u]}`);

function acceptedOf(ex: Exercise): string[] {
  switch (ex.type) {
    case "dictation": return [ex.audioText, ...(ex.accept ?? [])];
    case "translate_th_en": return ex.accept;
    case "fill_blank": return ex.answer;
    default: return [];
  }
}

/** Pronoun + 'd or would: grading folds only "'d like/love". */
const WOULD_SUBJECT = new Set(["i", "you", "he", "she", "we", "they"]);

export function checkAnswerForms(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const nouns = new Set<string>(), adjectives = new Set<string>();
  for (const { item } of ctx.bank.values()) {
    const w = item.word.toLowerCase();
    if (item.pos === "noun") nouns.add(w).add(`${w}s`).add(`${w}es`);
    if (item.pos === "adjective") adjectives.add(w);
  }
  const isPossessive = (next: string | undefined, after: string | undefined) =>
    next !== undefined && (nouns.has(next) || (adjectives.has(next) && after !== undefined && nouns.has(after)));

  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        if (ex.type !== "dictation" && ex.type !== "translate_th_en" && ex.type !== "fill_blank") continue;
        if (ex.strict === true) continue;
        const accepted = acceptedOf(ex);
        const have = new Set(accepted.map((a) => joinOrdinals(normalizeAnswer(a))));
        const add = (message: string) => problems.push({ rule: ANSWER_FORMS_RULE, file, id: ex.id, message });
        const STRICT = `or set "strict": true on this exercise (then only the listed spellings are accepted)`;
        const BOTH = `Also accept whichever full form is correct: "X has ..." (perfect) or "X is ..." (adjective or passive)`;

        if (ex.type === "fill_blank") {
          const marked = ex.answer.filter((a) => FOLDABLE.has(normalizeAnswer(a)));
          if (ex.strict === undefined && marked.length > 0) {
            add(`answer "${marked[0]}" is a contraction, a full form or a number; grading would fold it with its other spelling. Decide explicitly: set "strict": true (only "${marked[0]}") or "strict": false (the other spelling is accepted too).`);
            continue;
          }
        }

        for (const raw of new Set(accepted)) {
          const tokens = joinOrdinals(normalizeAnswer(raw)).split(" ").filter(Boolean);
          const variant = (i: number, replacement: string, drop = 1) => [...tokens.slice(0, i), replacement, ...tokens.slice(i + drop)].join(" ");
          const listed = (...vs: string[]) => vs.some((v) => have.has(v));

          if (/\d[:.]\d|\d,\d{3}(?!\d)/.test(raw)) {
            add(`"${raw}" has a number with ":", "," or "." inside; grading cannot fold it with other spellings. Accept every spelling you expect (e.g. "3:30" and "half past three"), ${STRICT}.`);
            continue;
          }
          tokens.forEach((t, i) => {
            const next = tokens[i + 1];
            const prev = tokens[i - 1];
            if (isSForm(t)) {
              const base = t.slice(0, -2);
              if (next !== "been" && next !== "got" && next !== undefined && isParticipleLike(next)) {
                if (!listed(variant(i, `${base} is`), variant(i, `${base} has`))) {
                  add(`"${raw}": "${t}" before "${next}" is ambiguous ("${base} is" or "${base} has"), so grading does not fold it. ${BOTH}, ${STRICT}.`);
                }
              }
            } else if (S_BASES.includes(t) && next === "is" && tokens[i + 2] !== undefined && isParticipleLike(tokens[i + 2])) {
              if (!listed(variant(i, `${t}'s`, 2))) add(`"${raw}": "${t} is ${tokens[i + 2]}" is not folded with "${t}'s ${tokens[i + 2]}" (ambiguous). Also accept the contracted form ("${variant(i, `${t}'s`, 2)}"), ${STRICT}.`);
            }
            if (t === "has" && prev !== undefined && next !== undefined && isParticipleLike(next)) {
              const folded = next === "been" || next === "got";
              if ((S_BASES.includes(prev) && !folded) || NAMES.has(prev)) {
                if (!listed(variant(i - 1, `${prev}'s`, 2))) add(`"${raw}": "${prev} has ${next}" is not folded with "${prev}'s ${next}". Also accept the contracted form ("${variant(i - 1, `${prev}'s`, 2)}"), ${STRICT}.`);
              }
            }
            if (t === "would" && prev !== undefined && WOULD_SUBJECT.has(prev) && next !== "like" && next !== "love") {
              if (!listed(variant(i - 1, `${prev}'d`, 2))) add(`"${raw}": "${prev} would" is not folded with "${prev}'d" (only 'd like/love is). Also accept the contracted form ("${variant(i - 1, `${prev}'d`, 2)}"), ${STRICT}.`);
            }
            if (NAMES.has(t) && next === "is") {
              if (!listed(variant(i, `${t}'s`, 2))) add(`"${raw}": "${t} is" is not folded with "${t}'s". Also accept the contracted form ("${variant(i, `${t}'s`, 2)}"), ${STRICT}.`);
            }
            const nm = /^([a-z]+)'s$/.exec(t);
            if (nm && NAMES.has(nm[1])) {
              if (!isPossessive(next, tokens[i + 2]) && !listed(variant(i, `${nm[1]} is`))) {
                add(`"${raw}": "${t}" may be "${nm[1]} is" or a possessive; it is not folded. Also accept the full form ("${variant(i, `${nm[1]} is`)}"), ${STRICT} (use strict when it is a possessive; a possessive followed by a noun from the vocab bank is recognised automatically).`);
              }
            } else if (t.includes("'") && !CONTRACTED_KEYS.has(t) && !isSForm(t) && !/^[a-z]+'s$/.test(t) && !/^[a-z]+s'$/.test(t) && t !== "o'clock") {
              const would = /^(i|you|he|she|we|they)'d$/.test(t) && (next === "like" || next === "love");
              const subject = t.slice(0, t.indexOf("'"));
              if (!would && !(t.endsWith("'d") && listed(variant(i, `${subject} would`), variant(i, `${subject} had`)))) {
                add(`"${raw}": "${t}" is not folded (only the forms in CONTRACTIONS and 'd like/love are) and can mean "would" or "had". Also accept the full form that is correct, ${STRICT}.`);
              }
            }
            const counterpart = COUNTERPART.get(t);
            if (counterpart !== undefined && !listed(variant(i, counterpart))) {
              add(`"${raw}": "${t}" is not folded with "${counterpart}". Also accept "${variant(i, counterpart)}", ${STRICT}.`);
            }
            if (/^\d+(st|nd|rd|th)$/.test(t) && !COUNTERPART.has(t)) {
              add(`"${raw}": the ordinal "${t}" is not folded with its spelling (only 1st-100th are). Accept every spelling you expect, ${STRICT}.`);
            } else if (/^\d+$/.test(t) && (Number(t) > 100 || (t.length > 1 && t.startsWith("0")))) {
              add(`"${raw}": the number "${t}" is not folded (only 1-100 are). Accept every spelling you expect, ${STRICT}.`);
            } else if (/^(thousand|million)$/.test(t) || (t === "hundred" && prev !== undefined && !["a", "one"].includes(prev))) {
              add(`"${raw}": the number containing "${t}" is not folded with its digits (only 1-100 are). Accept every spelling you expect (e.g. "200" and "two hundred"), ${STRICT}.`);
            }
          });
        }
      }
    }
  }
  return problems;
}
