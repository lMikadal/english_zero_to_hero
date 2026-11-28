// Rule "answer-forms": closes the traps of the grade-time folding (src/lib/answers/equivalents.ts). The folding is safe
// only where an expression has ONE reading. Where it cannot fold (ambiguous 's, 'd, Name's, ordinals, big numbers, zero),
// the author must either list every spelling the learner may type, or set `strict: true` on the item (which turns
// the folding off and says "only this spelling"). Checked for typed accepted answers of dictation, translate_th_en and fill_blank.
import { ADJECTIVES, ADVERBS, CONTRACTIONS, NUMBER_WORDS, S_BASES, isParticipleLike, isSForm, isSafeAfterS, sReading } from "@/lib/answers/equivalents";
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
/** Words that are a noun AND an adjective/adverb/place: after Name's they make it a contraction ("Tom's home"), never a possessive. */
const AMBIGUOUS_AFTER_NAME = new Set(["home", "back", "out", "in", "off", "up", "down", "here", "there", "right", "left", "long", "near", "fast", "late", "early", "free", "hard", "well"]);
/** After a common noun's 's these can only follow a contraction ("my mother's a teacher"), never a possessive. */
const CONTRACTION_CONTEXT = new Set(["a", "an", "the", "from", "in", "at", "on", "under", "near", "behind", "not"]);

/** First word after any adverbs (never, just, not, ...), and the number of tokens skipped. */
const skipAdverbs = (rest: readonly string[]): string | undefined => rest.find((w) => !ADVERBS.has(w));

export function checkAnswerForms(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const nouns = new Set<string>(), adjectives = new Set<string>(ADJECTIVES);
  for (const { item } of ctx.bank.values()) {
    const w = item.word.toLowerCase();
    if (item.pos === "noun") nouns.add(w).add(`${w}s`).add(`${w}es`);
    if (item.pos === "adjective") adjectives.add(w);
  }
  /** Name's + up to two adjectives + a noun of the bank (that is not also an adjective/adverb) is a possessive. */
  const isPossessive = (rest: readonly string[]) => {
    let k = 0;
    while (k < 2 && rest[k] !== undefined && adjectives.has(rest[k])) k++;
    const w = rest[k];
    return w !== undefined && nouns.has(w) && !adjectives.has(w) && !AMBIGUOUS_AFTER_NAME.has(w);
  };

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
          // clauses end at . ! ? , ; : an "is" at the end of a clause ("Yes, it is.") can never be contracted
          const tokens: string[] = [];
          const clauseEnd: number[] = [];
          for (const clause of raw.split(/[.!?,;]+/)) {
            const ts = joinOrdinals(normalizeAnswer(clause)).split(" ").filter(Boolean);
            if (ts.length === 0) continue;
            tokens.push(...ts);
            clauseEnd.push(...ts.map(() => tokens.length - 1));
          }
          const reading = (ts: readonly string[], i: number) => sReading(ts.slice(0, clauseEnd[i] + 1), i);
          const variant = (i: number, replacement: string, drop = 1) => [...tokens.slice(0, i), replacement, ...tokens.slice(i + drop)].join(" ");
          const listed = (...vs: string[]) => vs.some((v) => have.has(v));

          if (/\d[:.]\d|\d,\d{3}(?!\d)/.test(raw)) {
            add(`"${raw}" has a number with ":", "," or "." inside; grading cannot fold it with other spellings. Accept every spelling you expect (e.g. "3:30" and "half past three"), ${STRICT}.`);
            continue;
          }
          tokens.forEach((t, i) => {
            const next = clauseEnd[i + 1] === clauseEnd[i] ? tokens[i + 1] : undefined;
            const prev = tokens[i - 1];
            const rest = tokens.slice(i + 1, clauseEnd[i] + 1);
            if (isSForm(t)) {
              const base = t.slice(0, -2);
              if (reading(tokens, i) === null && !listed(variant(i, `${base} is`), variant(i, `${base} has`))) {
                add(`"${raw}": "${t}" before "${next ?? "the end"}" is ambiguous ("${base} is" or "${base} has") or not provably an "is", so grading does not fold it. ${BOTH}, ${STRICT}.`);
              }
            } else if (S_BASES.includes(t) && next === "is" && clauseEnd[i + 1] > i + 1) {
              const hypothetical = [...tokens.slice(0, i), `${t}'s`, ...tokens.slice(i + 2)];
              if (sReading(hypothetical.slice(0, clauseEnd[i + 1]), i) === null && !listed(variant(i, `${t}'s`, 2))) {
                add(`"${raw}": "${t} is ..." is not folded with "${t}'s ..." here (the word after it is not provably a non-verb). Also accept the contracted form ("${variant(i, `${t}'s`, 2)}"), ${STRICT}.`);
              }
            }
            if (t === "has" && prev !== undefined) {
              const w = skipAdverbs(rest);
              if (w !== undefined && isParticipleLike(w) && (S_BASES.includes(prev) || NAMES.has(prev))) {
                const hypothetical = [...tokens.slice(0, i - 1), `${prev}'s`, ...tokens.slice(i + 1)];
                const folded = S_BASES.includes(prev) && sReading(hypothetical.slice(0, clauseEnd[i]), i - 1) === "has";
                if (!folded && !listed(variant(i - 1, `${prev}'s`, 2))) {
                  add(`"${raw}": "${prev} has ..." is not folded with "${prev}'s ..." here. Also accept the contracted form ("${variant(i - 1, `${prev}'s`, 2)}"), ${STRICT}.`);
                }
              }
            }
            if (t === "would" && prev !== undefined && WOULD_SUBJECT.has(prev) && next !== "like" && next !== "love") {
              if (!listed(variant(i - 1, `${prev}'d`, 2))) add(`"${raw}": "${prev} would" is not folded with "${prev}'d" (only 'd like/love is). Also accept the contracted form ("${variant(i - 1, `${prev}'d`, 2)}"), ${STRICT}.`);
            }
            if (NAMES.has(t) && next === "is") {
              if (!listed(variant(i, `${t}'s`, 2))) add(`"${raw}": "${t} is" is not folded with "${t}'s". Also accept the contracted form ("${variant(i, `${t}'s`, 2)}"), ${STRICT}.`);
            }
            const nm = /^([a-z]+)'s$/.exec(t);
            if (nm && !isSForm(t) && !CONTRACTED_KEYS.has(t)) {
              const owner = nm[1];
              const isName = NAMES.has(owner);
              const contractionContext = isName ? !isPossessive(rest) : next !== undefined && CONTRACTION_CONTEXT.has(next);
              if (contractionContext && !listed(variant(i, `${owner} is`), variant(i, `${owner} has`))) {
                const w = skipAdverbs(rest);
                const provablyIs = w !== undefined && !ADVERBS.has(next ?? "") && isSafeAfterS(w) && next === w;
                add(`"${raw}": "${t}" may be "${owner} is" / "${owner} has" or a possessive; it is not folded. ${provablyIs ? `Also accept the full form ("${variant(i, `${owner} is`)}")` : BOTH}, ${STRICT} (use strict when it is a possessive; a possessive followed by a noun from the vocab bank is recognised automatically).`);
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
