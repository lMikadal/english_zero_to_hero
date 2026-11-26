// Display-only case for arrange_words tiles. A capital on the first word of the answer gives it away, so tiles are
// shown in lower case, except the pronoun "I" (and I'm, I'll...) and words that are capitalised in the middle of
// the answer or of any accepted sentence (proper nouns such as "Sam"). Grading never sees this: it is
// case-insensitive and the submitted text uses the original words.

const strip = (w: string) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
const PRONOUN_I = /^I(?:['’]\p{L}+)?$/u;

export function tileLabel(word: string, sentences: readonly string[]): string {
  if (PRONOUN_I.test(strip(word))) return word;
  const key = strip(word).toLowerCase();
  for (const sentence of sentences) {
    const tokens = sentence.split(" ").slice(1); // the first word is capitalised only because it starts a sentence
    if (tokens.some((t) => strip(t).toLowerCase() === key && /^\p{Lu}/u.test(strip(t)))) return word;
  }
  return word.toLowerCase();
}

/** The first tile of the answer row is shown with a capital, as the start of a sentence. */
export const capitaliseFirst = (label: string): string => label.charAt(0).toUpperCase() + label.slice(1);
