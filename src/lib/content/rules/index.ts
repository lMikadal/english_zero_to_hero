// All content rule families, in the order they are reported. Each is a pure function of the RuleContext.
import type { ContentData, Problem } from "../loader";
import { buildContext } from "./context";
import { checkGlossUniqueness } from "./gloss";
import { checkTaughtWords, checkVocabUsedOnItsDay } from "./taught-words";

export function checkContentRules(data: ContentData): Problem[] {
  const ctx = buildContext(data);
  return [...checkTaughtWords(ctx), ...checkVocabUsedOnItsDay(ctx), ...checkGlossUniqueness(ctx)];
}
