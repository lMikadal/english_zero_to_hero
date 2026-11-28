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
import { tokenize } from "./lexicon";

export const GRAMMAR_NOT_YET_RULE = "grammar-not-yet";

/** Present Simple week (docs/CURRICULUM.md: week 6 = days 36-42). */
export const THIRD_PERSON_S_DAY = 36;

export type GrammarGate = {
  /** First lesson day on which the form may be used. */
  day: number;
  /** What the form is, for the message. */
  what: string;
  /** How the author can rewrite the sentence (correct English only). */
  fix: string;
  /** "warning" when the day is not from the curriculum (a decision still to be taken). */
  severity?: "warning";
};

const THIRD_PERSON_FIX = `Rewrite the sentence with I / you / we / they and the base verb (for example "They live in Bangkok"), or explain the form in the \`glossary\` of a read_passage.`;

export const GRAMMAR_NOT_BEFORE: Readonly<Record<string, GrammarGate>> = {
  has: { day: 29, what: 'the third-person form of "have" ("has")', fix: `Use "have" with I / you / we / they (for example "I have a sister"), or explain "has" in the \`glossary\` of a read_passage.` },
  does: { day: THIRD_PERSON_S_DAY, what: 'the Present Simple form "does"', fix: `Use "do" with I / you / we / they (for example "How do you spell it?"), or explain "does" in the \`glossary\` of a read_passage.` },
  goes: { day: THIRD_PERSON_S_DAY, what: 'the third-person -s form of "go"', fix: THIRD_PERSON_FIX },
  "do not": {
    day: THIRD_PERSON_S_DAY, what: 'negative do-support ("do not" / "don\'t"): Present Simple negatives (questions such as "Do you ...?" are allowed earlier)',
    fix: `Use "am not" / "is not" / "are not" (for example "I am not a doctor"), or explain the form in the \`glossary\` of a read_passage.`,
  },
  but: {
    day: THIRD_PERSON_S_DAY, severity: "warning", what: 'the linking word "but" (the curriculum does not give its day: 36 is a placeholder, ask the curriculum owner)',
    fix: `Use two short sentences, or explain "but" in the \`glossary\` of a read_passage.`,
  },
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
    if (!out.has(form)) out.set(form, { day: THIRD_PERSON_S_DAY, base, what: `the third-person -s form of "${base}"`, fix: THIRD_PERSON_FIX });
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

/** The forms of `text` used before their day, in reading order, once each. */
function early(text: string, day: number, gate: Map<string, GrammarGate & { base?: string }>, allowed: ReadonlySet<string>): string[] {
  const tokens = tokenize(text);
  const found: string[] = [];
  tokens.forEach((word, i) => {
    const t = word === "do" && tokens[i + 1] === "not" ? "do not" : word; // the one two-word gate
    const g = gate.get(t);
    if (!g || g.day <= day || allowed.has(t) || found.includes(t)) return;
    if (g.base !== undefined && i > 0 && NOUN_CONTEXT.has(tokens[i - 1])) return;
    found.push(t);
  });
  return found;
}

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
      const forms = early(ex.en, day, gate, new Set());
      if (forms.length) report(entry.file, id, day, `examples[${i}] "${ex.en}"`, forms);
    });
  }
  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        const glossed = new Set(glossedWords(ex).flatMap(tokenize));
        for (const f of checkedEnglish(ex)) {
          if (f.drill || f.bilingual) continue;
          const forms = early(f.text, lesson.day, gate, glossed);
          if (forms.length) report(file, ex.id, lesson.day, `${f.field} "${f.text}"`, forms);
        }
      }
    }
  }
  return problems;
}
