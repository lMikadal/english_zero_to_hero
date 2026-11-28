// Rule "vocab-forms": an adjective lists its comparative and superlative (so the taught-words rule and the learner
// see "bigger"/"biggest" as forms of "big"), or says it has none with forms: { "gradable": "no" } (dead, wooden).
import type { Problem } from "../loader";
import type { RuleContext } from "./context";

export const VOCAB_FORMS_RULE = "vocab-forms";

export function checkVocabForms(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  for (const [id, { item, file }] of ctx.bank) {
    if (item.pos !== "adjective" || item.forms?.gradable === "no") continue;
    const missing = ["comparative", "superlative"].filter((k) => !item.forms?.[k]);
    if (missing.length) {
      problems.push({
        rule: VOCAB_FORMS_RULE, file, id,
        message: `adjective "${item.word}" has no forms.${missing.join(" / forms.")}. Add them (e.g. "comparative": "bigger", "superlative": "biggest") or, for an adjective that cannot be compared, "gradable": "no".`,
      });
    }
  }
  return problems;
}
