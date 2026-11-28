// All content rule families, in the order they are reported. Each is a pure function of the RuleContext.
import type { ContentData, Problem } from "../loader";
import { buildContext } from "./context";
import { checkAnswerForms } from "./answer-forms";
import { checkArrangeQuestion } from "./arrange-question";
import { checkArrangeWords } from "./arrange-words";
import { checkCast } from "./cast";
import { checkCastProps } from "./cast-props";
import { checkCheckpoints } from "./checkpoint";
import { checkGlossUniqueness } from "./gloss";
import { checkGrammarNotYet } from "./grammar-not-yet";
import { checkPhonemeTags } from "./phoneme-tags";
import { checkPronunciation } from "./pronunciation";
import { checkThaiNames } from "./thai-names";
import { checkVocabForms } from "./vocab-forms";
import { checkVocabSpelling } from "./vocab-spelling";
import { checkSoundWords } from "./sound-words";
import { checkTaughtWords, checkVocabUsedOnItsDay } from "./taught-words";

export function checkContentRules(data: ContentData): Problem[] {
  const ctx = buildContext(data);
  return [...checkTaughtWords(ctx), ...checkGrammarNotYet(ctx), ...checkVocabUsedOnItsDay(ctx), ...checkGlossUniqueness(ctx), ...checkPronunciation(ctx), ...checkSoundWords(ctx), ...checkPhonemeTags(ctx), ...checkArrangeWords(ctx), ...checkArrangeQuestion(ctx), ...checkAnswerForms(ctx), ...checkCast(ctx), ...checkCastProps(ctx), ...checkThaiNames(ctx), ...checkVocabForms(ctx), ...checkVocabSpelling(ctx), ...checkCheckpoints(ctx)];
}
