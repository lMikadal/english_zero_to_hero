// Rules "taught-words" and "vocab-used": learner-facing English only uses words taught by that day (or allowlisted),
// and every word a lesson teaches is used in that lesson. Word handling: lexicon.ts. Allowlists: allowlists.ts.
import type { Problem } from "../loader";
import { ALWAYS_ALLOWED, USED_BEFORE_TAUGHT } from "./allowlists";
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

/** Candidate base words of an inflected token: strips -s -es -ies -ing -ed -ied -er -est -ier -iest, undoubles, restores -e. */
function baseCandidates(t: string): string[] {
  const out: string[] = [];
  const add = (stem: string) => { if (stem.length >= 2) out.push(stem, `${stem}e`, `${stem}y`, ...(stem.length > 2 && stem.at(-1) === stem.at(-2) ? [stem.slice(0, -1)] : [])); };
  for (const [suf] of [["ing"], ["ed"], ["er"], ["est"], ["es"], ["s"], ["ied"], ["ier"], ["iest"], ["ies"]] as const) if (t.endsWith(suf) && t.length > suf.length + 1) add(t.slice(0, -suf.length));
  if (t.endsWith("ying")) out.push(`${t.slice(0, -4)}ie`);
  return out;
}

/** For tokens that look like an inflection of a taught word: the advice is to list the form, not to allowlist it. */
function inflectionHints(bad: string[], heads: ReadonlySet<string>): string {
  const lines = bad.flatMap((t) => {
    const base = baseCandidates(t).find((c) => c !== t && heads.has(c));
    return base ? [`"${t}" looks like a form of the taught word "${base}": add it to that entry's \`forms\` (e.g. comparative, superlative, past, present), not the allowlist.`] : [];
  });
  return lines.length ? ` ${lines.join(" ")}` : "";
}

/** Unknown tokens of `text` for a reader who knows what was taught by `day`; `extra` are always allowed. */
function unknown(text: string, day: number, firstDay: Map<string, number>, extra: ReadonlySet<string> = new Set()): string[] {
  const seen = new Set<string>();
  for (const t of tokenize(text)) {
    const d = firstDay.get(t);
    const until = USED_BEFORE_TAUGHT[t];
    if (!ALWAYS_ALLOWED.has(t) && !extra.has(t) && (until === undefined || day > until) && (d === undefined || d > day)) seen.add(t);
  }
  return [...seen];
}

export function checkTaughtWords(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const firstDay = firstDayOfForms(ctx);
  const heads = new Set<string>();
  for (const id of ctx.taughtIn.keys()) { const w = ctx.bank.get(id)?.item.word.toLowerCase(); if (w) for (const p of w.split(/\s+/)) heads.add(p); }
  const hint = (bad: string[]) => inflectionHints(bad, heads);

  for (const [id, { item, file }] of ctx.bank) {
    const taught = ctx.taughtIn.get(id);
    if (!taught) continue; // not taught yet: no day to measure against
    item.examples.forEach((ex, i) => {
      const bad = unknown(ex.en, taught.day, firstDay);
      if (bad.length) {
        problems.push({
          rule: TAUGHT_WORDS_RULE, file, id,
          message: `examples[${i}] "${ex.en}" uses words not taught by day ${taught.day} (the day ${id} is first taught): ${quoted(bad)}. ${FIX}${hint(bad)}`,
        });
      }
    });
  }

  for (const { file, day, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        const glossed = new Set(glossedWords(ex).flatMap(tokenize));
        const found: string[] = [];
        const allBad: string[] = [];
        for (const f of learnerEnglish(ex)) {
          if (f.drill || f.bilingual) continue;
          const bad = unknown(f.text, day, firstDay, glossed);
          if (bad.length) { found.push(`${quoted(bad)} in ${f.field}`); allBad.push(...bad); }
        }
        if (found.length) {
          problems.push({ rule: TAUGHT_WORDS_RULE, file, id: ex.id, message: `uses words not taught by day ${day}: ${found.join("; ")}. ${FIX}${hint(allBad)}` });
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

/** Days on which `token` appears in checked learner-facing text before its entry is taught (or when it never is). Used by the allowlist tests. */
export function untaughtUses(ctx: RuleContext, token: string): number[] {
  const firstDay = firstDayOfForms(ctx);
  const first = firstDay.get(token);
  const days = new Set<number>();
  const visit = (text: string, day: number) => {
    if (tokenize(text).includes(token) && (first === undefined || first > day)) days.add(day);
  };
  for (const [id, { item }] of ctx.bank) {
    const taught = ctx.taughtIn.get(id);
    if (taught) for (const ex of item.examples) visit(ex.en, taught.day);
  }
  for (const { lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) for (const f of learnerEnglish(ex)) if (!f.drill && !f.bilingual) visit(f.text, lesson.day);
    }
  }
  return [...days].sort((a, b) => a - b);
}
