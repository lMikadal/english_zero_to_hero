// Rule "phrase-lint" (WARNING): phrasings an A1 lesson should not teach, found in the learner-facing English of every exercise.
// A small explicit table (PHRASE_LINTS) of patterns with the natural alternative in the message; warnings, because a pattern can
// be fine in a quotation or a joke. Add a pattern here the second time a review finds the same phrasing (docs/CONTENT_SCHEMA.md).
import type { Problem } from "../loader";
import type { RuleContext } from "./context";
import { learnerEnglish } from "./learner-text";

export const PHRASE_LINT_RULE = "phrase-lint";

type Lint = {
  id: string;
  pattern: RegExp;
  /** The sentence is fine when it also matches this (for example "would like some" is the natural offer). */
  unless?: RegExp;
  message: string;
};

export const PHRASE_LINTS: readonly Lint[] = [
  {
    id: "like-some", pattern: /\blikes? some\b/i, unless: /\bwould\b|'d\b/i,
    message: `"like some" is not how English says what you want or enjoy. To offer or ask, write "Would you like some tea?" or "I would like some tea"; to say what you enjoy, drop "some": "I like tea".`,
  },
  {
    id: "i-order-please", pattern: /\bI order\b[^.?!]*\bplease\b/i, unless: /\b(?:can|could|may|shall)\s+I\b/i,
    message: `"I order ..., please" sounds odd when you are ordering. Write "I would like a coffee, please" or "Can I have a coffee, please?".`,
  },
  {
    id: "do-you-not", pattern: /\bdo you not\b/i,
    message: `"Do you not ..." is stiff. Write "Don't you like tea?" or, for a plain question, "Do you like tea?".`,
  },
  {
    id: "how-many-has", pattern: /\bHow many \w+ has (?:the|a|my|your|his|her)\b/i,
    message: `"How many cats has my sister?" is old-fashioned. Write "How many cats does my sister have?".`,
  },
];

export function checkPhraseLint(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        const warned = new Set<string>();
        for (const f of learnerEnglish(ex)) {
          for (const lint of PHRASE_LINTS) {
            if (warned.has(lint.id)) continue;
            for (const sentence of f.text.split(/(?<=[.!?])\s+/)) {
              if (!lint.pattern.test(sentence) || lint.unless?.test(sentence)) continue;
              warned.add(lint.id);
              problems.push({
                rule: PHRASE_LINT_RULE, file, id: ex.id, severity: "warning",
                message: `${f.field} "${sentence.trim()}": ${lint.message}`,
              });
              break;
            }
          }
        }
      }
    }
  }
  return problems;
}
