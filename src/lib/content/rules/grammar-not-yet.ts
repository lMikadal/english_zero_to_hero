// Rule "grammar-not-yet": a word FORM may need a grammar point that is taught later than the word itself.
// The taught-words rule treats an inflected form as the same word ("lives" counts as "live", which is right for the
// vocabulary question "has the learner met this word?"), so it cannot see that "He lives ..." needs the Present Simple
// third-person -s, which the curriculum teaches in week 6. That is a different question (a grammar gate, a first
// allowed DAY per form, with its own advice), so it is a separate rule and taught-words stays about words.
//
// GRAMMAR_NOT_BEFORE is the explicit table (form -> first allowed day, taken from docs/CURRICULUM.md section 4:
// week 5 = days 29-35 "have/has", week 6 = days 36-42 "Present Simple"). On top of it, the regular third-person -s of every
// verb entry of the vocab bank (lives, loves, works, ...) is gated at THIRD_PERSON_S_DAY.
// Checked: learner-facing English of every exercise (not sound drills, not bilingual question texts) and the examples of
// vocab entries (on the day they are taught). A form is allowed in an exercise whose read_passage `glossary` lists it.
// Skipped on purpose: a form right after a determiner or number ("their lives", "two works") reads as a noun, and a word
// that also has a noun entry in the bank ("play") gets no generated form. ERROR, except entries marked severity "warning".
import type { Problem } from "../loader";
import type { RuleContext } from "./context";
import { ALWAYS_ALLOWED } from "./allowlists";
import { glossedWords, learnerEnglish, type LearnerField } from "./learner-text";
import type { Exercise } from "../schema";
import { surfaceForms, tokenize } from "./lexicon";

export const GRAMMAR_NOT_YET_RULE = "grammar-not-yet";

/** Present Simple week (docs/CURRICULUM.md: week 6 = days 36-42). */
export const THIRD_PERSON_S_DAY = 36;

/** Week 7 (docs/CURRICULUM.md: days 43-49 "daily routine, adverbs of frequency"): the frequency adverbs are taught on day 44. */
export const FREQUENCY_ADVERB_DAY = 44;

/** Week 8 (docs/CURRICULUM.md: days 50-56 "time, days, months"): telling the time on day 50, at / on / in on day 51. */
export const CLOCK_TIME_DAY = 50;
export const TIME_PREPOSITION_DAY = 51;

/** Week 10 (phase 2): the present continuous on day 64, its questions and negatives on day 65. */
export const PRESENT_CONTINUOUS_DAY = 64;
export const CONTINUOUS_QUESTION_DAY = 65;

/**
 * The grammar structures a grammar_note can explain (`structures` ids) and the first day each is allowed. Every gate below
 * names one of them. Add an id here when a new gate is added; rule "grammar-note" rejects any other id in a note.
 */
export const GRAMMAR_STRUCTURES: Readonly<Record<string, { day: number; what: string }>> = {
  has: { day: 29, what: 'has: the third-person form of "have"' },
  "third-person-s": { day: THIRD_PERSON_S_DAY, what: "the Present Simple -s of he / she / it (likes, lives, works)" },
  "es-ending": { day: THIRD_PERSON_S_DAY, what: "the Present Simple -es / -ies of he / she / it (goes, watches, studies)" },
  "do-does-question": { day: THIRD_PERSON_S_DAY, what: 'Present Simple questions with does ("What does she do?")' },
  "do-not": { day: THIRD_PERSON_S_DAY, what: 'negative do-support ("do not" / "don\'t")' },
  but: { day: THIRD_PERSON_S_DAY, what: 'the linking word "but"' },
  "clock-time": { day: CLOCK_TIME_DAY, what: "telling the time (What time is it? It is seven o'clock / half past seven)" },
  "time-prepositions": { day: TIME_PREPOSITION_DAY, what: "at / on / in with times, days and months (at seven o'clock, on Monday, in May)" },
  "present-continuous": { day: PRESENT_CONTINUOUS_DAY, what: "the present continuous statement (am / is / are + verb-ing: She is reading)" },
  "continuous-question": { day: CONTINUOUS_QUESTION_DAY, what: "present continuous questions, short answers and negatives (What are you doing? Is he reading? No, he isn't)" },
  "frequency-adverb": { day: FREQUENCY_ADVERB_DAY, what: "adverbs of frequency (always, usually, often, sometimes, never) and their place before the main verb / after be" },
};

export type GrammarGate = {
  /** The structure (a key of GRAMMAR_STRUCTURES) this form belongs to. */
  structure: string;
  /** First lesson day on which the form may be used. */
  day: number;
  /** What the form is, for the message. */
  what: string;
  /** How the author can rewrite the sentence (correct English only). */
  fix: string;
  /** "warning" when the day is not from the curriculum (a decision still to be taken). */
  severity?: "warning";
  /** Only a form right after am / is / are (also after "not"): "is raining", not "I like swimming" or "the morning". */
  afterBe?: true;
  /** An extra accepted typed answer may use it before its day (a learner who knows it is not marked wrong). */
  lenientInAccept?: true;
};

const BE_FORMS: ReadonlySet<string> = new Set(["am", "is", "are"]);
const CONTINUOUS_FIX = `Rewrite the sentence with the Present Simple or with be + adjective (for example "It is rainy"), or explain the form in the \`glossary\` of a read_passage.`;

const THIRD_PERSON_FIX = `Rewrite the sentence with I / you / we / they and the base verb (for example "They live in Bangkok"), or explain the form in the \`glossary\` of a read_passage.`;

export const GRAMMAR_NOT_BEFORE: Readonly<Record<string, GrammarGate>> = {
  has: { structure: "has", day: 29, what: 'the third-person form of "have" ("has")', fix: `Use "have" with I / you / we / they (for example "I have a sister"), or explain "has" in the \`glossary\` of a read_passage.` },
  does: { structure: "do-does-question", day: THIRD_PERSON_S_DAY, what: 'the Present Simple form "does"', fix: `Use "do" with I / you / we / they (for example "How do you spell it?"), or explain "does" in the \`glossary\` of a read_passage.` },
  goes: { structure: "es-ending", day: THIRD_PERSON_S_DAY, what: 'the third-person -s form of "go"', fix: THIRD_PERSON_FIX },
  "do not": {
    structure: "do-not", day: THIRD_PERSON_S_DAY, what: 'negative do-support ("do not" / "don\'t"): Present Simple negatives (questions such as "Do you ...?" are allowed earlier)',
    fix: `Use "am not" / "is not" / "are not" (for example "I am not a doctor"), or explain the form in the \`glossary\` of a read_passage.`,
  },
  but: {
    structure: "but", day: THIRD_PERSON_S_DAY, severity: "warning", what: 'the linking word "but" (the curriculum does not give its day: 36 is a placeholder, ask the curriculum owner)',
    fix: `Use two short sentences, or explain "but" in the \`glossary\` of a read_passage.`,
  },
  "o'clock": {
    structure: "clock-time", day: CLOCK_TIME_DAY, what: 'telling the time with "o\'clock"',
    fix: `Rewrite the sentence without clock times, or explain "o'clock" in the \`glossary\` of a read_passage.`,
  },
  ...Object.fromEntries(["raining", "snowing"].map((w) => [w, {
    structure: "present-continuous", day: PRESENT_CONTINUOUS_DAY, afterBe: true, lenientInAccept: true, what: `the present continuous "be ${w}"`, fix: CONTINUOUS_FIX,
  } satisfies GrammarGate])),
  ...Object.fromEntries(["always", "usually", "often", "sometimes", "never"].map((w) => [w, {
    structure: "frequency-adverb", day: FREQUENCY_ADVERB_DAY, what: `the frequency adverb "${w}" and its word order (before the main verb, after "be")`,
    fix: `Rewrite the sentence without "${w}" (for example "I eat rice."), or explain the word in the \`glossary\` of a read_passage.`,
  } satisfies GrammarGate])),
};

/** Words that look like a third-person -s form but are words in their own right (interjections); never generated. */
const NOT_A_VERB_FORM: ReadonlySet<string> = new Set(["thanks"]);

/** "live" -> "lives", "watch" -> "watches", "study" -> "studies", "go" -> "goes". */
export function thirdPersonS(word: string): string {
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh|o)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** form -> gate, plus the base word for a generated form. */
function gates(ctx: RuleContext): Map<string, GrammarGate & { base?: string }> {
  const out = new Map<string, GrammarGate & { base?: string }>(Object.entries(GRAMMAR_NOT_BEFORE));
  const nouns = new Set<string>();
  const bankWords = new Set<string>();
  for (const { item } of ctx.bank.values()) {
    bankWords.add(item.word.toLowerCase());
    if (item.pos === "noun") nouns.add(item.word.toLowerCase());
  }
  for (const { item } of ctx.bank.values()) {
    const base = item.word.toLowerCase().split(/\s+/)[0];
    if (item.pos !== "verb" || ["be", "have", "do"].includes(base) || nouns.has(base)) continue;
    const form = thirdPersonS(base);
    if (NOT_A_VERB_FORM.has(form) || ALWAYS_ALLOWED.has(form) || bankWords.has(form)) continue; // a word in its own right
    if (!out.has(form)) out.set(form, { structure: /(s|x|z|ch|sh|o)$|[^aeiou]y$/.test(base) ? "es-ending" : "third-person-s", day: THIRD_PERSON_S_DAY, base, what: `the third-person -s form of "${base}"`, fix: THIRD_PERSON_FIX });
  }
  // the present continuous: the -ing form of every verb entry, only right after am / is / are
  for (const { item } of ctx.bank.values()) {
    const base = item.word.toLowerCase().split(/\s+/)[0];
    if (item.pos !== "verb" || base === "be") continue;
    for (const form of surfaceForms(item)) {
      if (!form.endsWith("ing") || form === base || bankWords.has(form) || ALWAYS_ALLOWED.has(form) || out.has(form)) continue;
      out.set(form, { structure: "present-continuous", day: PRESENT_CONTINUOUS_DAY, afterBe: true, lenientInAccept: true, base, what: `the present continuous "be ${form}"`, fix: CONTINUOUS_FIX });
    }
  }
  return out;
}

const NOUN_CONTEXT = new Set(["a", "an", "the", "my", "your", "his", "her", "its", "our", "their", "this", "that", "these", "those", "some", "any", "no", "many", "all",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]);

/** Every English text a learner reads or hears, field by field: learnerEnglish plus the alternative accepted answers that it leaves out. */
export function checkedEnglish(ex: Exercise): LearnerField[] {
  const list = (name: string, xs: readonly string[], from = 0): LearnerField[] => xs.slice(from).map((text, i) => ({ field: `${name}[${i + from}]`, text }));
  switch (ex.type) {
    case "translate_th_en": return [...learnerEnglish(ex), ...list("accept", ex.accept, 1)];
    case "dictation": return [...learnerEnglish(ex), ...list("accept", ex.accept ?? [])];
    case "arrange_words": return [...learnerEnglish(ex), ...list("accept", ex.accept ?? [])];
    default: return learnerEnglish(ex);
  }
}

type Gates = Map<string, GrammarGate & { base?: string }>;

/** The gated forms `text` uses, in reading order, once each (whatever the day). */
export function usedForms(text: string, gate: Gates, allowed: ReadonlySet<string> = new Set(), allowedStructures: ReadonlySet<string> = new Set()): string[] {
  const tokens = tokenize(text);
  const found: string[] = [];
  tokens.forEach((word, i) => {
    const t = word === "do" && tokens[i + 1] === "not" ? "do not" : word; // the one two-word gate
    const g = gate.get(t);
    if (!g || allowed.has(t) || allowedStructures.has(g.structure) || found.includes(t)) return;
    if (g.afterBe && !(BE_FORMS.has(tokens[i - 1] ?? "") || (tokens[i - 1] === "not" && BE_FORMS.has(tokens[i - 2] ?? "")))) return;
    if (g.base !== undefined && !g.afterBe && i > 0 && NOUN_CONTEXT.has(tokens[i - 1])) return;
    found.push(t);
  });
  return found;
}

/** The forms of `text` used before their day. */
function early(text: string, day: number, gate: Gates, allowed: ReadonlySet<string>, allowedStructures: ReadonlySet<string>): string[] {
  return usedForms(text, gate, allowed, allowedStructures).filter((f) => gate.get(f)!.day > day);
}

export { gates as grammarGates };

export function checkGrammarNotYet(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const gate = gates(ctx);
  const report = (file: string, id: string, day: number, where: string, forms: string[]) => {
    const lines = forms.map((f) => `"${f}" is ${gate.get(f)!.what}; first allowed on day ${gate.get(f)!.day}`);
    const severity = forms.every((f) => gate.get(f)!.severity === "warning") ? ({ severity: "warning" } as const) : {};
    problems.push({
      rule: GRAMMAR_NOT_YET_RULE, file, id, ...severity,
      message: `${where} uses a form of a grammar point not taught yet by day ${day}: ${lines.join("; ")}. ${[...new Set(forms.map((f) => gate.get(f)!.fix))].join(" ")}`,
    });
  };

  for (const [id, { day }] of ctx.taughtIn) {
    const entry = ctx.bank.get(id);
    entry?.item.examples.forEach((ex, i) => {
      const forms = early(ex.en, day, gate, new Set(), new Set());
      if (forms.length) report(entry.file, id, day, `examples[${i}] "${ex.en}"`, forms);
    });
  }
  for (const { file, day, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        const glossed = new Set(glossedWords(ex).flatMap(tokenize));
        const noteStructures = new Set(ex.type === "grammar_note" ? ex.structures : []); // a note may show the form it explains
        for (const f of checkedEnglish(ex)) {
          if (f.drill || f.bilingual) continue;
          const lenient = f.field.startsWith("accept[");
          const forms = early(f.text, day, gate, glossed, noteStructures).filter((x) => !(lenient && gate.get(x)!.lenientInAccept));
          if (forms.length) report(file, ex.id, day, `${f.field} "${f.text}"`, forms);
        }
      }
    }
  }
  return problems;
}
