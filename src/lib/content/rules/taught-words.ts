// Rules "taught-words" and "vocab-used": learner-facing English only uses words taught by that day (or allowlisted),
// and every word a lesson teaches is used in that lesson. Word handling: lexicon.ts. Allowlists: allowlists.ts.
import type { Problem } from "../loader";
import { ALWAYS_ALLOWED } from "./allowlists";
import type { RuleContext } from "./context";
import { glossedWords, learnerEnglish } from "./learner-text";
import { surfaceForms, tokenize, usageForms } from "./lexicon";

export const TAUGHT_WORDS_RULE = "taught-words";
export const VOCAB_USED_RULE = "vocab-used";

/** form -> first day a taught entry has that form. */
function firstDayOfForms(ctx: RuleContext): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, { day }] of ctx.taughtIn) {
    const entry = ctx.bank.get(id);
    if (!entry) continue;
    for (const f of surfaceForms(entry.item)) if (!out.has(f) || out.get(f)! > day) out.set(f, day);
  }
  return out;
}

const quoted = (words: string[]) => words.map((w) => `"${w}"`).join(", ");
const FIX = "Teach the word earlier, rewrite the text, or (names, function words) add it to src/lib/content/rules/allowlists.ts.";

/** Unknown tokens of `text` for a reader who knows what was taught by `day`; `extra` are always allowed. */
function unknown(text: string, day: number, firstDay: Map<string, number>, extra: ReadonlySet<string> = new Set()): string[] {
  const seen = new Set<string>();
  for (const t of tokenize(text)) {
    const d = firstDay.get(t);
    if (!ALWAYS_ALLOWED.has(t) && !extra.has(t) && (d === undefined || d > day)) seen.add(t);
  }
  return [...seen];
}

export function checkTaughtWords(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const firstDay = firstDayOfForms(ctx);

  for (const [id, { item, file }] of ctx.bank) {
    const taught = ctx.taughtIn.get(id);
    if (!taught) continue; // not taught yet: no day to measure against
    item.examples.forEach((ex, i) => {
      const bad = unknown(ex.en, taught.day, firstDay);
      if (bad.length) {
        problems.push({
          rule: TAUGHT_WORDS_RULE, file, id,
          message: `examples[${i}] "${ex.en}" uses words not taught by day ${taught.day} (the day ${id} is first taught): ${quoted(bad)}. ${FIX}`,
        });
      }
    });
  }

  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        const glossed = new Set(glossedWords(ex).flatMap(tokenize));
        const found: string[] = [];
        for (const f of learnerEnglish(ex)) {
          if (f.drill || f.bilingual) continue;
          const bad = unknown(f.text, lesson.day, firstDay, glossed);
          if (bad.length) found.push(`${quoted(bad)} in ${f.field}`);
        }
        if (found.length) {
          problems.push({ rule: TAUGHT_WORDS_RULE, file, id: ex.id, message: `uses words not taught by day ${lesson.day}: ${found.join("; ")}. ${FIX}` });
        }
      }
    }
  }
  return problems;
}

export function checkVocabUsedOnItsDay(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  for (const { file, lesson } of ctx.lessons) {
    const used = new Set(lesson.sections.flatMap((s) => s.exercises.flatMap((ex) => learnerEnglish(ex).flatMap((f) => tokenize(f.text)))));
    lesson.vocab.forEach((id, i) => {
      const entry = ctx.bank.get(id);
      if (!entry) return;
      const forms = usageForms(entry.item);
      if (![...forms].some((f) => used.has(f))) {
        problems.push({
          rule: VOCAB_USED_RULE, file, id,
          message: `vocab[${i}]: "${entry.item.word}" is taught on day ${lesson.day} but no exercise of this lesson uses it (looked for "${entry.item.word}" or an inflected form in the learner-facing English). Use it in an exercise or move it to the day that does.`,
        });
      }
    });
  }
  return problems;
}
