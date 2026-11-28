// Rule "vocab-spelling": a single-word headword that is in the UK/US spelling table (src/lib/answers/spelling.ts) must
// carry the OTHER spelling in `forms`: `usSpelling` on a UK headword (colour), `ukSpelling` on a US headword (mom). Grading
// folds the two spellings, and taught-words / the lessons treat the listed form as the same word, so the entry must say it.
// Skipped: a US-side headword that is also a correct UK word (practice, tire, license, program, meter: isSenseDependent), because
// the entry may mean the other sense. ERROR otherwise: the table decides, there is no judgement. Multi-word headwords are not checked.
import { isSenseDependent, isUkSpelling, otherSpelling } from "@/lib/answers/spelling";
import type { Problem } from "../loader";
import type { RuleContext } from "./context";

export const VOCAB_SPELLING_RULE = "vocab-spelling";

export function checkVocabSpelling(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  for (const [id, { item, file }] of ctx.bank) {
    const word = item.word.toLowerCase();
    const other = /\s/.test(word) ? undefined : otherSpelling(word);
    if (other === undefined || isSenseDependent(word)) continue; // the US spelling is also a UK word of another sense: no demand either way
    const key = isUkSpelling(word) ? "usSpelling" : "ukSpelling";
    const wrongKey = key === "usSpelling" ? "ukSpelling" : "usSpelling";
    const have = item.forms?.[key];
    if (have === other && item.forms?.[wrongKey] === undefined) continue;
    const found = have !== undefined ? `forms.${key} is "${have}"` : item.forms?.[wrongKey] !== undefined ? `forms.${wrongKey} is used on a ${key === "usSpelling" ? "UK" : "US"} headword` : `forms has no ${key}`;
    problems.push({
      rule: VOCAB_SPELLING_RULE, file, id,
      message: `"${item.word}" is a ${key === "usSpelling" ? "UK" : "US"} spelling in the UK/US table (src/lib/answers/spelling.ts), but ${found}. Add "${key}": "${other}" to its forms (and remove "${wrongKey}" if it is there).`,
    });
  }
  return problems;
}
