// All content rule families, in the order they are reported. Each is a pure function of the RuleContext.
import type { ContentData, Problem } from "../loader";
import { buildContext } from "./context";
import { checkAnswerForms } from "./answer-forms";
import { checkArrangeQuestion } from "./arrange-question";
import { checkArrangeWords } from "./arrange-words";
import { checkCast } from "./cast";
import { checkGlossUniqueness } from "./gloss";
import { checkPhonemeTags } from "./phoneme-tags";
import { checkPronunciation } from "./pronunciation";
import { checkVocabForms } from "./vocab-forms";
import { checkSoundWords } from "./sound-words";
import { checkTaughtWords, checkVocabUsedOnItsDay } from "./taught-words";

export function checkContentRules(data: ContentData): Problem[] {
  const ctx = buildContext(data);
  return [...checkTaughtWords(ctx), ...checkVocabUsedOnItsDay(ctx), ...checkGlossUniqueness(ctx), ...checkPronunciation(ctx), ...checkSoundWords(ctx), ...checkPhonemeTags(ctx), ...checkArrangeWords(ctx), ...checkArrangeQuestion(ctx), ...checkAnswerForms(ctx), ...checkCast(ctx), ...checkVocabForms(ctx)];
}
