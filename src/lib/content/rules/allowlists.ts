// The ONLY place where words are allowed in learner-facing English without being taught (rule "taught-words").
// Every list here must SHRINK over time; tests (allowlists.stale.test.ts) fail when an entry makes an item redundant.
// Adding a word here is a decision, not a fix: prefer teaching the word earlier or rewriting the sentence.
//
// Everything is lower case except PROPER_NAMES (which also drives the arrange_words rule, see arrange-words.ts).

/**
 * Closed-class words with no entry (and none planned): they are not "new vocabulary", the course introduces them
 * through patterns (My name is..., This is a...). A test fails if one of these gets a vocab entry.
 */
export const FUNCTION_WORDS: readonly string[] = [
  "a", "an", "the", // articles
  "and", "or", "but", // conjunctions
  "of", "to", "at", // prepositions
  "baht", // the currency of the learner's country, used in the number lessons (a loanword, not an Oxford word)
];

/**
 * Oxford A1 words that are used from day 1 but have no vocab entry yet. Known gap: give each an entry, then delete it
 * here. A test fails as soon as an entry exists, so this list cannot rot.
 */
export const A1_WORDS_WITHOUT_ENTRY_YET: readonly string[] = [
  "i", "you", "it", "my", "your", // pronouns and determiners of the day-1 patterns
  "what", "who", // question words
  "too", // "Nice to meet you, too"
];

/**
 * Words that HAVE an entry, but the reviewed lessons use them before the entry's day. word -> the LATEST lesson day
 * on which it may still be used untaught (always before the entry's day). Fix for the content writer: teach the entry
 * earlier, then delete the word here. A test fails when the entry is missing, the word is no longer used untaught,
 * or the limit is not before the teaching day.
 */
export const USED_BEFORE_TAUGHT: Readonly<Record<string, number>> = {
  // forms of "be" are used as chunks from day 1 (My name IS Sam, I AM Ann); v-be is taught on day 8
  am: 7, is: 7, are: 7,
  in: 11, // v-in is taught on day 12; "Ann is in my school" (day 9), "I work in a school" (day 11)
  yes: 9, no: 9, // Yes / No answer choices in the day-3 and day-4 reading questions; v-yes, v-no are taught on day 10
  // day-1 patterns ("This is a pen", "I have a cat"); the entries arrive with the week-3 grammar (days 15-17)
  this: 14, have: 15,
  // 11-19 are first heard as the -teen pattern in the pronunciation sections of days 10-11; cards come in week 3
  eleven: 10, twelve: 14, thirteen: 13, fourteen: 14, fifteen: 11, sixteen: 10, seventeen: 10, eighteen: 10, nineteen: 10,
  // thirty ... ninety: the -ty pattern of days 11-14 (ages, "She is thirty"); the cards come in week 4 (days 22-26)
  thirty: 14, forty: 14, fifty: 14, sixty: 11, seventy: 11, eighty: 11, ninety: 11,
};

/**
 * Number words with no entry of their own. Empty since week 4: thirty ... ninety have entries (days 22-26).
 * Kept (empty) so a future number word without an entry has a place to go.
 */
export const NUMBER_WORDS_WITHOUT_ENTRY: readonly string[] = [];

/**
 * Names of people, places and brands used in the lessons. Written as they are spelled (capital first letter).
 * arrange_words checks that a capitalised mid-sentence word is in this list (UI and content must agree).
 */
export const PROPER_NAMES: readonly string[] = [
  "Sam", "Ann", "Ben", "Mai", "Tom", "Nok", "Max", "Jen", "Jim", "Lek", "Jack", "Pim", "Kate", "Lisa", "Fon", "Rose", "Dan", "Leo", "Mali", "Ray", "Nan", "Thailand", "Bangkok", "England", "Japan", "Chiang",
];

/**
 * One Thai spelling per character name (rule "thai-names"). Add the Thai spelling of every new person in PROPER_NAMES here
 * the day the name is first used; every lesson must then write the name exactly this way. Places are not listed.
 */
export const THAI_NAMES: Readonly<Record<string, string>> = {
  Sam: "แซม", Ann: "แอน", Ben: "เบน", Mai: "ไหม", Tom: "ทอม", Nok: "นก", Max: "แม็กซ์", Jen: "เจน", Jim: "จิม", Lek: "เล็ก", Jack: "แจ็ค", Pim: "พิม",
  Kate: "เคท", Lisa: "ลิซ่า", Fon: "ฝน", Rose: "โรส", Dan: "แดน", Leo: "ลีโอ", Mali: "มาลี", Ray: "เรย์", Nan: "แนน",
};

/** Names that are not people (no Thai spelling is required). */
export const PLACE_NAMES: readonly string[] = ["Thailand", "Bangkok", "England", "Japan", "Chiang"];

/**
 * People whose Thai spelling is also an everyday Thai word (ไหม = the question particle, นก = bird, เล็ก = small, ฝน = rain):
 * a near-variant of them cannot be told from another word, so only the other names are checked for misspellings.
 */
export const THAI_NAME_IS_A_WORD: readonly string[] = ["Mai", "Nok", "Lek", "Fon"];

/**
 * Everyday Thai words (and particles) that stand where a name can stand and are one edit from a name (แดง "red" ~ แดน, เจ็ด "seven" ~ เจน,
 * จริง "true" ~ จิม ...). Rule "thai-names" never reports one of these as a misspelled name; it also never reports a word that
 * occurs in the Thai of the vocab bank. Add a word here when the rule reports a real word, never to hide a misspelled name.
 */
export const COMMON_THAI_WORDS: readonly string[] = [
  "แดง", "แดด", "ดิน", "แปด", "เจ็ด", "เป็น", "จริง", "เคย", "เทา", "แม่", "ทอง", "เรียน", "แอบ", "แซง", "โรง", "มาลัย", "เบาะ", "จิ้ม",
  "เบา", "เน้น", "เช่น", "เติม", "แทน", "แหวน", "เล่น", "เห็น", "เย็น", "เว้น", "เดิน", "เด็ก", "เจอ", "เพิ่ม", "เกิน", "เกม", "แจก", "แจ้ง", "แถม", "แก่", "แต่ง",
  "ทอด", "นอน", "นัก", "นั่ง", "พิมพ์", "พิเศษ", "ลีลา", "ลิง", "ลิ้น", "โรค", "มาก", "มาด", "มารยาท", "จิตใจ",
];

/** Every single letter is allowed: the alphabet and spelling exercises (B, U, S). */
export const LETTERS: readonly string[] = "abcdefghijklmnopqrstuvwxyz".split("");

/** Lower-case set used by the taught-words rule. */
export const ALWAYS_ALLOWED: ReadonlySet<string> = new Set([
  ...FUNCTION_WORDS, ...A1_WORDS_WITHOUT_ENTRY_YET, ...NUMBER_WORDS_WITHOUT_ENTRY, ...PROPER_NAMES.map((n) => n.toLowerCase()), ...LETTERS,
]);

/**
 * Words that must not appear anywhere a learner reads or hears English (rule "word-blocklist", an error): not suitable for a
 * beginner course, including sound-drill words and minimal pairs, where such a word is easy to pick because it is a short
 * word that differs by one sound ("help-hell"). Keep it short: the obvious mild swear words, profanities and slurs. Whole words,
 * lower case. Add a word here when a review finds one; there is no per-item exception, choose another word instead.
 */
export const BLOCKED_WORDS: readonly string[] = [
  "hell", "damn", "shit", "fuck", "bitch", "bastard", "whore", "slut", "cunt", "nigger", "faggot",
];
