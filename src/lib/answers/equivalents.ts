// Client-safe and pure. Typed answers are compared after normalizeAnswer(); this module then folds the spellings a
// learner may choose freely into ONE canonical form, on both sides, so content authors never write them out:
//   - a contraction and its full form ("he's" / "he is", "don't" / "do not", "can't" / "cannot"),
//   - a number word and its digits ("ten" / "10", "twenty-one" / "21", "a hundred" / "100").
// What is NOT folded (the author must list both forms, or set `strict`; the validator rule "answer-forms" checks it):
//   's unless what follows is provably not a verb (see sReading: an ALLOW-list, so an unknown word can only under-accept),
//   'd except before like/love, Name+'s, ordinals, 101+, "zero", 3:30.
// Rule is documented in docs/CONTENT_SCHEMA.md ("การเทียบคำตอบ"). Input must already be normalised
// (lower case, straight apostrophe, punctuation removed).
import { foldSpelling } from "./spelling";

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

// ---- 's -> "is": an ALLOW-list. X's is folded to "X is" only when the next word (after an optional "not") provably cannot
// be part of a verb: a determiner, a number, a closed set of prepositions/places, an -ing word, or a plain adjective.
// Everything else (adverbs, pronouns, unknown words, any participle) is NOT folded, so an unknown word can only make
// grading stricter; the answer-forms rule then asks the author to list both forms. Used by grading AND by the rule.
export const DETERMINERS: ReadonlySet<string> = new Set(
  "a an the my your his her our their its this that these those some any no every each another many much all both".split(" "));
export const PLACES: ReadonlySet<string> = new Set(
  "in at on from under here there near behind over with of for to by about into inside outside up down off out away back home next between beside above below across around".split(" "));
/** Adjectives that cannot be a participle. Never contains a PARTICIPLES word (a test checks), and covers every adjective of the vocab bank that is not participle-like (a test checks). */
export const ADJECTIVES: ReadonlySet<string> = new Set((
  "good bad big small little nice fine hot cold warm cool old new young happy sad tall short long fat thin hungry thirsty ready busy free late early " +
  "right wrong easy hard difficult cheap expensive clean dirty kind sick ill well great ok okay sorry angry afraid sure pretty beautiful quiet loud " +
  "fast slow strong weak rich poor full empty open safe real true correct high low heavy light dark bright soft sweet delicious famous different same " +
  "special important interesting funny friendly careful lovely red blue green yellow black white brown pink orange purple grey gray hungry fun " +
  "favourite favorite nervous healthy lucky shy polite honest clever smart cute proud brave calm crazy rude silly all"
).split(" "));
const NUMBER_WORD_SET = new Set<string>([...NUMBER_WORDS.flatMap(([, w]) => w.split(" ")), "zero", "hundred", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]);
const NOT_ING = new Set(["thing", "bring", "spring", "string", "swing"]);
/** Adverbs that may stand between a subject (or has) and the verb; the rule looks through them. */
export const ADVERBS: ReadonlySet<string> = new Set(
  "not never already just ever always often also still only really usually sometimes recently finally even almost nearly".split(" "));

// Groups added in round 4. Each can never be a past participle, so "X's <word>" can only be "X is <word>":
/** weather adjectives (adjectives only; no verb form exists) */
const WEATHER = ["sunny", "rainy", "cloudy", "windy", "foggy", "snowy", "stormy"];
/** days and months (nouns; "has Monday" is not English) */
const CALENDAR = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "april", "june", "july", "august", "september", "october", "november", "december"];
/** nationalities / languages (adjective or noun, never a participle) */
const NATIONALITIES = ["thai", "english", "japanese", "chinese", "american", "british", "french", "german", "korean", "indian", "italian", "spanish", "australian", "canadian"];
/** object and possessive pronouns: safe only after he's/she's/it's ("it's me"); after a wh-word they would hide "What's he done" style has-readings */
const OBJECT_PRONOUNS = new Set(["me", "him", "us", "them", "mine", "yours", "ours", "theirs"]);
const SAFE_EXTRA = new Set([...WEATHER, ...CALENDAR, ...NATIONALITIES]);

export function isSafeAfterS(w: string): boolean {
  if (SAFE_EXTRA.has(w)) return true;
  if (DETERMINERS.has(w) || PLACES.has(w) || ADJECTIVES.has(w) || NUMBER_WORD_SET.has(w)) return true;
  if (/^\d+$/.test(w)) return true;
  if (/^[a-z]+'s$/.test(w) && !S_FORM.test(w)) return true; // a possessive ("it's Ann's pen") starts a noun phrase
  const h = HYPHENATED.exec(w);
  if (h) return true;
  return w.length >= 5 && w.endsWith("ing") && !NOT_ING.has(w);
}

/**
 * How the 's at tokens[i] reads: "has" (directly before been/got), "is" (the next word, skipping one "not" and one "very", is provably
 * not a verb), or null (not folded: the answer-forms rule makes the author list both forms or set `strict`).
 */
export function sReading(tokens: readonly string[], i: number): "is" | "has" | null {
  const t = tokens[i];
  if (t === undefined || !S_FORM.test(t)) return null;
  let next = tokens[i + 1];
  if (next === "been" || next === "got") return "has";
  if (t === "name's") return next !== undefined && isParticipleLike(next) ? null : "is";
  let j = i + 1;
  if (tokens[j] === "not") j++;
  // "very" is transparent like "not": nothing perfect follows it ("He's very happy" can only be "is"), so the word after it
  // is judged exactly as after "not". "very much" is not (He's very much done it), and really / so / too / quite are not
  // either (He's really done it, He's so tired he has gone ...): they stay unfolded and the author lists both forms.
  const afterVery = tokens[j] === "very";
  if (afterVery) j++;
  if (afterVery && tokens[j] === "much") return null;
  next = tokens[j];
  if (!afterVery && next !== undefined && OBJECT_PRONOUNS.has(next) && /^(he|she|it)'s$/.test(t)) return "is";
  return next !== undefined && isSafeAfterS(next) ? "is" : null;
}
const WOULD = /^(i|you|he|she|we|they)'d$/;
const NOT_ED = new Set(["speed", "breed", "indeed", "hundred", "need", "feed", "seed", "weed", "deed", "reed", "heed", "shed", "sled", "naked"]);

/**
 * Irregular past forms and participles (and the -ed look-alikes' counterparts that do not end in -ed). A word here means
 * "'s before it is ambiguous (is / has), do not fold". ONE table for grading and for the answer-forms rule; a test proves
 * every past / pastParticiple form of the vocab bank is either an -ed word or listed here. Be generous: extra entries only
 * make the validator ask authors to list both forms.
 */
export const PARTICIPLES: ReadonlySet<string> = new Set((
  "been had done gone come seen got gotten made said taken given known thought told found left felt become put kept begun began " +
  "brought bought written sat stood heard run read met paid sent built spent lost cut eaten drunk driven spoken broken chosen " +
  "forgotten fallen grown shown slept sold taught understood won worn caught held let set hit hurt cost flown drawn thrown " +
  "risen ridden sung swum sunk sworn torn woken woven wrung shaken shot shut shrunk slid split spread sprung stuck stung struck " +
  "swept swung bent bet bitten bled blown bred burnt burst dealt dug dreamt dived fed fled flung forgiven fought frozen " +
  "hung hidden knelt laid lain led leapt lent lit mistaken overcome proven proved quit rung rode sawn sewn shone shorn slain " +
  "slit smelt sown spat spelt spilt spun stolen strung strode swollen thrust trodden upset wept withdrawn " +
  "meant learnt learned beaten sought crept used died tied lied dyed lay laid swept wept leant leapt dwelt " +
  "forgot got saw ate took gave knew wrote spoke broke chose drove flew grew threw drew rose rang sang swam wore began did went came was were drank"
).split(" "));

/** A word after 's that may be a past participle (so 's may be "has"): the table, or an -ed word of 4+ letters. */
export function isParticipleLike(w: string): boolean {
  return PARTICIPLES.has(w) || (w.length >= 4 && w.endsWith("ed") && !NOT_ED.has(w));
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
      const reading = sReading(tokens, i);
      if (reading === "has") out.push(t.slice(0, -2), "has");
      else if (reading === "is") out.push(...(CONTRACTED.get(t) ?? t).split(" "));
      else out.push(t);
    } else if (WOULD.test(t) && (next === "like" || next === "love")) {
      out.push(t.slice(0, -2), "would");
    } else if (t === "let's" || (CONTRACTED.has(t) && !t.endsWith("'s"))) {
      out.push(...CONTRACTED.get(t)!.split(" "));
    } else {
      out.push(...(numberTokens(t) ?? [foldSpelling(t)]));
    }
  });
  return out.join(" ");
}
