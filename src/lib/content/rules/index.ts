// All content rule families, in the order they are reported. Each is a pure function of the RuleContext.
import type { ContentData, Problem } from "../loader";
import { buildContext } from "./context";
import { checkArrangeWords } from "./arrange-words";
import { checkGlossUniqueness } from "./gloss";
import { checkPronunciation } from "./pronunciation";
import { checkTaughtWords, checkVocabUsedOnItsDay } from "./taught-words";

export function checkContentRules(data: ContentData): Problem[] {
  const ctx = buildContext(data);
  return [...checkTaughtWords(ctx), ...checkVocabUsedOnItsDay(ctx), ...checkGlossUniqueness(ctx), ...checkPronunciation(ctx), ...checkArrangeWords(ctx)];
}
