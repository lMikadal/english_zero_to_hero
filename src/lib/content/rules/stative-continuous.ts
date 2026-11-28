// Rule "stative-continuous" (WARNING): verbs of state or achievement are not used in the continuous ("He is finding a picture",
// "I am liking rice", "It is costing ten baht"). A small explicit list on purpose: "have" (possess vs eat/have a meal) is too
// ambiguous to check. Warning, because a rare use can be right ("She is loving it" in ads). Read in the learner-facing English of
// every exercise and checkpoint and the vocab examples; an extra accepted answer is read too.
import type { Problem } from "../loader";
import type { RuleContext } from "./context";
import { checkedEnglish } from "./grammar-not-yet";
import { tokenize } from "./lexicon";

export const STATIVE_CONTINUOUS_RULE = "stative-continuous";
export const STATIVE_ING: readonly string[] = ["finding", "knowing", "liking", "wanting", "needing", "loving", "hating", "costing", "understanding", "believing"];
const BE = new Set(["am", "is", "are"]);

export const statefulContinuous = (text: string): string[] => {
  const t = tokenize(text);
  return t.filter((w, i) => STATIVE_ING.includes(w) && (BE.has(t[i - 1] ?? "") || (t[i - 1] === "not" && BE.has(t[i - 2] ?? ""))));
};

export function checkStativeContinuous(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const report = (file: string, id: string, where: string, text: string, w: string) =>
    problems.push({ rule: STATIVE_CONTINUOUS_RULE, file, id, severity: "warning", message: `${where} "${text}": "${w}" is a verb of state or achievement and is not used in the continuous. Use the simple form ("Leo always finds his key", "I like rice") or another verb ("He is looking at a picture").` });
  for (const [id] of ctx.taughtIn) {
    const entry = ctx.bank.get(id);
    entry?.item.examples.forEach((ex, i) => { for (const w of statefulContinuous(ex.en)) report(entry.file, id, `examples[${i}]`, ex.en, w); });
  }
  for (const { file, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        if (ex.type === "grammar_note") continue; // a card may show the wrong form on purpose (✗)
        for (const f of checkedEnglish(ex)) for (const w of statefulContinuous(f.text)) report(file, ex.id, f.field, f.text, w);
      }
    }
  }
  return problems;
}
