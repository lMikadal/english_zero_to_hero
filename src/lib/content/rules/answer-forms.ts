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

const ORDINALS: readonly (readonly [string, string])[] = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth",
  "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth",
].map((w, i) => [w, `${i + 1}${[1, 2, 3].includes((i + 1) % 10) && ![11, 12, 13].includes(i + 1) ? ["st", "nd", "rd"][((i + 1) % 10) - 1] : "th"}`] as const);
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

export function checkAnswerForms(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const participles = new Set<string>();
  for (const { item } of ctx.bank.values()) for (const k of ["past", "pastParticiple"]) if (item.forms?.[k]) participles.add(item.forms[k].toLowerCase());
  const isParticiple = (w: string | undefined) => w !== undefined && (isParticipleLike(w) || participles.has(w));

  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        if (ex.type !== "dictation" && ex.type !== "translate_th_en" && ex.type !== "fill_blank") continue;
        if (ex.strict === true) continue;
        const accepted = acceptedOf(ex);
        const have = new Set(accepted.map(normalizeAnswer));
        const add = (message: string) => problems.push({ rule: ANSWER_FORMS_RULE, file, id: ex.id, message });
        const STRICT = `or set "strict": true on this exercise (then only the listed spellings are accepted)`;

        if (ex.type === "fill_blank") {
          const marked = ex.answer.filter((a) => FOLDABLE.has(normalizeAnswer(a)));
          if (ex.strict === undefined && marked.length > 0) {
            add(`answer "${marked[0]}" is a contraction, a full form or a number; grading would fold it with its other spelling. Decide explicitly: set "strict": true (only "${marked[0]}") or "strict": false (the other spelling is accepted too).`);
            continue;
          }
        }

        for (const raw of new Set(accepted)) {
          const tokens = normalizeAnswer(raw).split(" ").filter(Boolean);
          const variant = (i: number, replacement: string, drop = 1) => [...tokens.slice(0, i), replacement, ...tokens.slice(i + drop)].join(" ");
          const listed = (...vs: string[]) => vs.some((v) => have.has(v));

          if (/\d[:.]\d|\d,\d{3}(?!\d)/.test(raw)) {
            add(`"${raw}" has a number with ":", "," or "." inside; grading cannot fold it with other spellings. Accept every spelling you expect (e.g. "3:30" and "half past three"), ${STRICT}.`);
            continue;
          }
          tokens.forEach((t, i) => {
            const next = tokens[i + 1];
            if (isSForm(t)) {
              const base = t.slice(0, -2);
              if (next !== "been" && next !== "got" && isParticiple(next)) {
                if (!listed(variant(i, `${base} is`), variant(i, `${base} has`))) {
                  add(`"${raw}": "${t}" before "${next}" can be "${base} is" or "${base} has", so it is not folded. Also accept the full form ("${variant(i, `${base} ${isParticipleLike(next ?? "") ? "is" : "has"}`)}"), ${STRICT}.`);
                }
              }
            } else if (S_BASES.includes(t) && next === "is" && isParticiple(tokens[i + 2])) {
              if (!listed(variant(i, `${t}'s`, 2))) add(`"${raw}": "${t} is ${tokens[i + 2]}" is not folded with "${t}'s ${tokens[i + 2]}" (ambiguous). Also accept the contracted form ("${variant(i, `${t}'s`, 2)}"), ${STRICT}.`);
            }
            const nm = /^([a-z]+)'s$/.exec(t);
            if (nm && NAMES.has(nm[1])) {
              if (!listed(variant(i, `${nm[1]} is`))) {
                add(`"${raw}": "${t}" may be "${nm[1]} is" or a possessive; it is not folded. Also accept the full form ("${variant(i, `${nm[1]} is`)}"), ${STRICT} (use strict when it is a possessive).`);
              }
            } else if (t.includes("'") && !CONTRACTED_KEYS.has(t) && !isSForm(t) && !/^[a-z]+'s$/.test(t) && t !== "o'clock") {
              const would = /^(i|you|he|she|we|they)'d$/.test(t) && (next === "like" || next === "love");
              if (!would) add(`"${raw}": the contraction "${t}" is not folded (only the forms in CONTRACTIONS and 'd before like/love are). Also accept the full form ("I would go" / "I had gone"), ${STRICT}.`);
            }
            const counterpart = COUNTERPART.get(t);
            if (counterpart !== undefined && !listed(variant(i, counterpart))) {
              add(`"${raw}": "${t}" is not folded with "${counterpart}". Also accept "${variant(i, counterpart)}", ${STRICT}.`);
            }
            if (/^\d+$/.test(t) && (Number(t) > 100 || (t.length > 1 && t.startsWith("0")))) {
              add(`"${raw}": the number "${t}" is not folded (only 1-100 are). Accept every spelling you expect, ${STRICT}.`);
            } else if (/^(thousand|million)$/.test(t) || (t === "hundred" && tokens[i - 1] !== undefined && !["a", "one"].includes(tokens[i - 1]))) {
              add(`"${raw}": the number containing "${t}" is not folded with its digits (only 1-100 are). Accept every spelling you expect (e.g. "200" and "two hundred"), ${STRICT}.`);
            }
          });
        }
      }
    }
  }
  return problems;
}
