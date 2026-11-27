// The ONLY place where words are allowed in learner-facing English without being taught (rule "taught-words").
// Both lists must SHRINK over time: when a word gets a vocab entry, delete it here (the entry's day then governs).
// Adding a word here is a decision, not a fix: prefer teaching the word earlier or rewriting the sentence.
//
// Everything is lower case except PROPER_NAMES (which also drives the arrange_words rule, see arrange-words.ts).

/**
 * Function words and other very frequent words that have no vocab entry yet. They are not "new vocabulary" for the
 * learner: the course introduces them through patterns (My name is..., This is a..., I have...) rather than as cards.
 */
export const FUNCTION_WORDS: readonly string[] = [
  "a", "an", "the", // articles
  "and", "or", "but", // conjunctions
  "of", "to", "at", // prepositions
  "i", "you", "it", "this", "that", "my", "your", // pronouns and determiners used from day 1
  "what", // question word of the day-1 patterns
  "have", // "I have a cat" (v-cat example); no entry yet
  "who", // question word (Who is your friend?); no entry yet
  "baht", // the currency of the learner's country, used in the number lessons
  "too", // "Nice to meet you, too" (glossed on day 1, used again on day 7)
  // Forms of "be" are used as chunks from day 1 (My name IS Sam, I AM Ann, You ARE...). The entry v-be is taught on
  // day 8; delete these three when the course teaches "be" earlier.
  "am", "is", "are",
];

/**
 * Words that HAVE an entry, but the entry is taught later than the reviewed lessons already use the word.
 * Recommended fix for the content writer: move the entry to an earlier day, then delete the word from this list.
 */
export const USED_BEFORE_TAUGHT: readonly string[] = [
  "in", // v-in is taught on day 12, but days 8, 9 and 11 already use it ("Ann is in my school", "I work in a school")
  "yes", "no", // answer choices (Yes / No) in the day-3 and day-4 reading questions; v-yes and v-no are taught on day 10
  "box", // the /ɑː/ example word, used in repeat_after_me sentences on days 4 and 6; no entry exists
];

/**
 * Number words with no entry of their own: 11-19 and the tens are taught as a pattern (-teen / -ty) in the pronunciation
 * sections of days 10-11 rather than as cards.
 */
export const NUMBER_WORDS_WITHOUT_ENTRY: readonly string[] = [
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

/**
 * Names of people, places and brands used in the lessons. Written as they are spelled (capital first letter).
 * arrange_words checks that a capitalised mid-sentence word is in this list (UI and content must agree).
 */
export const PROPER_NAMES: readonly string[] = [
  "Sam", "Ann", "Ben", "Mai", "Tom", "Nok", "Max", "Jen", "Jim", "Thailand", "Bangkok", "England", "Japan", "Chiang",
];

/** Every single letter is allowed: the alphabet and spelling exercises (B, U, S). */
export const LETTERS: readonly string[] = "abcdefghijklmnopqrstuvwxyz".split("");

/** Lower-case set used by the taught-words rule. */
export const ALWAYS_ALLOWED: ReadonlySet<string> = new Set([
  ...FUNCTION_WORDS, ...USED_BEFORE_TAUGHT, ...NUMBER_WORDS_WITHOUT_ENTRY, ...PROPER_NAMES.map((n) => n.toLowerCase()), ...LETTERS,
]);
