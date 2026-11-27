// Client-safe and pure. Typed answers are compared after normalizeAnswer(); this module then folds the spellings a
// learner may choose freely into ONE canonical form, on both sides, so content authors never write them out:
//   - a contraction and its full form ("he's" / "he is", "don't" / "do not", "can't" / "cannot"),
//   - a number word and its digits ("ten" / "10", "a hundred" / "100").
// Rule is documented in docs/CONTENT_SCHEMA.md ("การเทียบคำตอบ"). Input must already be normalised
// (lower case, straight apostrophe, punctuation removed).

/** [contracted, full]. Keys are whole tokens. Only forms with ONE reading are listed ('d and 'll-with-names are not). */
export const CONTRACTIONS: readonly (readonly [contracted: string, full: string])[] = [
  ["i'm", "i am"], ["you're", "you are"], ["he's", "he is"], ["she's", "she is"], ["it's", "it is"],
  ["we're", "we are"], ["they're", "they are"], ["that's", "that is"], ["there's", "there is"], ["here's", "here is"],
  ["what's", "what is"], ["where's", "where is"], ["who's", "who is"], ["how's", "how is"], ["name's", "name is"],
  ["let's", "let us"],
  ["i'll", "i will"], ["you'll", "you will"], ["he'll", "he will"], ["she'll", "she will"], ["it'll", "it will"],
  ["we'll", "we will"], ["they'll", "they will"],
  ["i've", "i have"], ["you've", "you have"], ["we've", "we have"], ["they've", "they have"],
  ["isn't", "is not"], ["aren't", "are not"], ["wasn't", "was not"], ["weren't", "were not"],
  ["don't", "do not"], ["doesn't", "does not"], ["didn't", "did not"],
  ["can't", "can not"], ["cannot", "can not"], ["won't", "will not"],
  ["wouldn't", "would not"], ["shouldn't", "should not"], ["couldn't", "could not"], ["mustn't", "must not"],
  ["haven't", "have not"], ["hasn't", "has not"], ["hadn't", "had not"],
];

/** [digits, word]. Whole tokens only: "110" is not "ten". */
export const NUMBER_WORDS: readonly (readonly [digits: string, word: string])[] = [
  ["1", "one"], ["2", "two"], ["3", "three"], ["4", "four"], ["5", "five"], ["6", "six"], ["7", "seven"], ["8", "eight"],
  ["9", "nine"], ["10", "ten"], ["11", "eleven"], ["12", "twelve"], ["13", "thirteen"], ["14", "fourteen"],
  ["15", "fifteen"], ["16", "sixteen"], ["17", "seventeen"], ["18", "eighteen"], ["19", "nineteen"], ["20", "twenty"],
  ["30", "thirty"], ["40", "forty"], ["50", "fifty"], ["60", "sixty"], ["70", "seventy"], ["80", "eighty"],
  ["90", "ninety"], ["100", "one hundred"],
];

const CONTRACTED = new Map<string, string>(CONTRACTIONS);
const DIGITS = new Map<string, string>(NUMBER_WORDS);
/** "'s" forms that could also be "has": left alone before "got" ("he's got a pen"). */
const AMBIGUOUS_S = /'s$/;

export function canonicalAnswer(normalised: string): string {
  const tokens = normalised.split(" ").filter(Boolean);
  const out: string[] = [];
  tokens.forEach((t, i) => {
    if (t === "hundred" && tokens[i - 1] === "a") {
      out[out.length - 1] = "one"; // "a hundred" = "100"
      out.push(t);
    } else if (AMBIGUOUS_S.test(t) && tokens[i + 1] === "got") {
      out.push(t);
    } else {
      out.push(CONTRACTED.get(t) ?? DIGITS.get(t) ?? t);
    }
  });
  return out.join(" ");
}
