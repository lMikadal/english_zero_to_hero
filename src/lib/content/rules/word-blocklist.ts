// Rule "word-blocklist" (ERROR): no word of BLOCKED_WORDS (allowlists.ts) in any English a learner reads or hears, sound drills and
// minimal pairs included, and not in the vocab bank (headwords and examples). Whole words only, any case ("hello", "shell" and
// "Michelle" are different words). An error because there is no legitimate use: pick another word.
import type { Problem } from "../loader";
import { BLOCKED_WORDS } from "./allowlists";
import type { RuleContext } from "./context";
import { checkedEnglish } from "./grammar-not-yet";

export const WORD_BLOCKLIST_RULE = "word-blocklist";

const BLOCKED = new Set(BLOCKED_WORDS);
const hits = (text: string) => [...new Set((text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => BLOCKED.has(w)))];
const FIX = "is not suitable for a beginner course (BLOCKED_WORDS in src/lib/content/rules/allowlists.ts). Choose another word; for a minimal pair pick another pair with the same sound contrast.";

export function checkWordBlocklist(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  for (const [id, { item, file }] of ctx.bank) {
    for (const [where, text] of [["word", item.word], ...item.examples.map((e, i) => [`examples[${i}]`, e.en] as const)]) {
      for (const w of hits(text)) problems.push({ rule: WORD_BLOCKLIST_RULE, file, id, message: `${where} "${text}": "${w}" ${FIX}` });
    }
  }
  for (const { file, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        for (const f of checkedEnglish(ex)) {
          for (const w of hits(f.text)) problems.push({ rule: WORD_BLOCKLIST_RULE, file, id: ex.id, message: `${f.field} "${f.text}": "${w}" ${FIX}` });
        }
      }
    }
  }
  return problems;
}
