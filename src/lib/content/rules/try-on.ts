// Rule "try-on" (ERROR): in English you try ON clothes ("Nan tries on a red skirt"), you try food and things ("try the soup",
// "try a guitar"). "tries a red skirt" is a literal translation of the Thai word and wrong. Found in the learner-facing English
// of every exercise of every lesson and checkpoint, in EVERY accepted answer (extra ones too: a wrong accept teaches nothing,
// but it marks a wrong answer right) and in the vocab examples.
import type { Problem } from "../loader";
import type { RuleContext } from "./context";
import { checkedEnglish } from "./grammar-not-yet";
import { tokenize } from "./lexicon";

export const TRY_ON_RULE = "try-on";
const TRY_FORMS = new Set(["try", "tries", "trying", "tried"]);
const CLOTHES = new Set(["clothes", "shirt", "shoe", "shoes", "dress", "skirt", "jacket", "coat", "hat", "trousers", "jeans"]);

/** True when a form of "try" is followed (within 6 words) by a clothing word with no "on" before or right after it. */
export function triesClothesWithoutOn(text: string): boolean {
  return text.split(/(?<=[.!?])\s+/).some((sentence) => {
    const t = tokenize(sentence);
    return t.some((w, i) => {
      if (!TRY_FORMS.has(w)) return false;
      const window = t.slice(i + 1, i + 7);
      const at = window.findIndex((x) => CLOTHES.has(x));
      return at >= 0 && !window.slice(0, at + 2).includes("on");
    });
  });
}

export function checkTryOn(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const report = (file: string, id: string, where: string, text: string) =>
    problems.push({ rule: TRY_ON_RULE, file, id, message: `${where} "${text}": you try on clothes ("Nan tries on a red skirt", "Nan is trying a red skirt on"); "try" without "on" is for food and things ("try the soup"). Add "on".` });
  for (const [id] of ctx.taughtIn) {
    const entry = ctx.bank.get(id);
    entry?.item.examples.forEach((ex, i) => { if (triesClothesWithoutOn(ex.en)) report(entry.file, id, `examples[${i}]`, ex.en); });
  }
  for (const { file, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        for (const f of checkedEnglish(ex)) if (!f.drill && triesClothesWithoutOn(f.text)) report(file, ex.id, f.field, f.text);
      }
    }
  }
  return problems;
}
