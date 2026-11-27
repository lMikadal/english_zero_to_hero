// Client-safe and pure. Typed answers are compared after normalizeAnswer(); this module then folds the spellings a
// learner may choose freely into ONE canonical form, on both sides, so content authors never write them out:
//   - a contraction and its full form ("he's" / "he is", "don't" / "do not", "can't" / "cannot"),
//   - a number word and its digits ("ten" / "10", "twenty-one" / "21", "a hundred" / "100").
// What is NOT folded (the author must list both forms, or set `strict`; the validator rule "answer-forms" checks it):
//   's before a past participle or -ed word (is/has?), 'd except before like/love, Name+'s, ordinals, 101+, "zero", 3:30.
// Rule is documented in docs/CONTENT_SCHEMA.md ("การเทียบคำตอบ"). Input must already be normalised
// (lower case, straight apostrophe, punctuation removed).

/**
 * [contracted, full]. Keys are whole tokens. The 's forms are ambiguous (is / has) and are handled in canonicalAnswer:
 * before been/got they mean "has", before a participle they are left alone. 'd is only folded before like/love.
 */
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
const UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const HYPHENATED = new RegExp(`^(${TENS.join("|")})-(${UNITS.join("|")})$`);
const S_FORM = /^(he|she|it|that|there|here|what|where|who|how|name)'s$/;
/** The words an ambiguous 's (is / has) can follow, without the 's. */
export const S_BASES: readonly string[] = ["he", "she", "it", "that", "there", "here", "what", "where", "who", "how", "name"];
export const isSForm = (t: string): boolean => S_FORM.test(t);
const WOULD = /^(i|you|he|she|we|they)'d$/;
const IRREGULAR_PARTICIPLES = new Set(["gone", "done", "seen", "taken", "given", "eaten", "written", "spoken", "known", "broken", "made", "found", "left", "lost", "met", "heard", "said", "told"]);
const NOT_ED = new Set(["speed", "breed", "indeed", "hundred"]);

/** A word after 's that may be a past participle (so 's may be "has"): -ed words of 5+ letters and common irregular ones. */
export function isParticipleLike(w: string): boolean {
  return IRREGULAR_PARTICIPLES.has(w) || (w.length >= 5 && w.endsWith("ed") && !NOT_ED.has(w));
}

function numberTokens(t: string): string[] | undefined {
  const h = HYPHENATED.exec(t);
  if (h) return [h[1], h[2]];
  if (/^[2-9][1-9]$/.test(t)) return [TENS[Number(t[0]) - 2], UNITS[Number(t[1]) - 1]];
  const d = DIGITS.get(t);
  return d ? d.split(" ") : undefined;
}

export function canonicalAnswer(normalised: string): string {
  const tokens = normalised.split(" ").filter(Boolean);
  const out: string[] = [];
  tokens.forEach((t, i) => {
    const next = tokens[i + 1];
    if (t === "hundred" && tokens[i - 1] === "a") {
      out[out.length - 1] = "one"; // "a hundred" = "100"
      out.push(t);
    } else if (S_FORM.test(t)) {
      const base = t.slice(0, -2);
      if (next === "been" || next === "got") out.push(base, "has");
      else if (next !== undefined && isParticipleLike(next)) out.push(t);
      else out.push(...(CONTRACTED.get(t) ?? t).split(" "));
    } else if (WOULD.test(t) && (next === "like" || next === "love")) {
      out.push(t.slice(0, -2), "would");
    } else if (t === "let's" || (CONTRACTED.has(t) && !t.endsWith("'s"))) {
      out.push(...CONTRACTED.get(t)!.split(" "));
    } else {
      out.push(...(numberTokens(t) ?? [t]));
    }
  });
  return out.join(" ");
}
