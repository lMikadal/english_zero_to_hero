// Lesson-load rules from the week-6 content review (first week at 10-12 new words a day). Each has a constant that says from
// which day / week it applies, so weeks 1-5 stay quiet; pass `fromDay` / `fromWeek` = 1 to see what it WOULD say for them.
//  "word-exposure"                 WARNING  a new word occurs 3+ times in 2+ exercise types (outside vocab_match) of its own lesson.
//  "week-recycle"                  WARNING  every word of the teaching days of a week appears on its review or challenge day.
//  "vocab-match-covers-new-words"  ERROR    from day 36: the vocab_match exercises of a teaching day cover all its new words, and
//                                           one vocab_match has at most 8 pairs (a longer match does not fit a 360px screen).
//  "new-words-per-day"             ERROR    from day 43: a lesson with a grammar_note (it introduces a grammar form) teaches at
//                                           most 9 new words. The general cap of 12 per lesson (all days) is enforced in validate.ts.
// word-exposure counts only what the learner hears, reads as text, says or produces (see exposureByExercise); week-recycle counts
// every English text of the review days (learnerEnglish: vocab_match excluded) and the entry's usage forms (so "cats" counts for "cat" and "wakes" for "wake up").
import type { Problem } from "../loader";
import type { RuleContext } from "./context";
import { learnerEnglish } from "./learner-text";
import { tokenize, usageForms } from "./lexicon";

export const WORD_EXPOSURE_RULE = "word-exposure";
export const WEEK_RECYCLE_RULE = "week-recycle";
export const VOCAB_MATCH_RULE = "vocab-match-covers-new-words";
export const NEW_WORDS_RULE = "new-words-per-day";

export const WORD_EXPOSURE_FROM_DAY = 36;
export const WORD_EXPOSURE_MIN_OCCURRENCES = 3;
export const WORD_EXPOSURE_MIN_TYPES = 2;
export const WEEK_RECYCLE_FROM_WEEK = 6;
export const VOCAB_MATCH_FROM_DAY = 36;
export const VOCAB_MATCH_MAX_PAIRS = 8;
/** Owner decision 2026-11-28: a day that introduces a grammar form teaches at most this many new words (other days up to 12). */
export const GRAMMAR_DAY_MAX_NEW_WORDS = 9;
export const GRAMMAR_DAY_FROM_DAY = 43;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const weekOf = (day: number) => Math.floor((day - 1) / 7) + 1;

/** Tokens of the learner-facing English of each exercise of a lesson. */
function tokensByExercise(lesson: { sections: { exercises: Parameters<typeof learnerEnglish>[0][] }[] }): { type: string; tokens: string[] }[] {
  return lesson.sections.flatMap((s) => s.exercises.map((ex) => ({ type: ex.type, tokens: learnerEnglish(ex).flatMap((f) => tokenize(f.text)) })));
}

/**
 * What the learner really meets a word in: what they hear (audioText, lines), read as passage or dialogue text, say or produce
 * (prompts, answers, accepted sentences). NOT counted, because the learner only glances at them: bilingual question and goal
 * texts, answer choices, sound drills (phoneme examples, minimal pairs) and the examples of a grammar_note.
 */
function exposureByExercise(lesson: { sections: { exercises: Parameters<typeof learnerEnglish>[0][] }[] }): { type: string; tokens: string[] }[] {
  return lesson.sections.flatMap((s) => s.exercises.map((ex) => ({
    type: ex.type,
    tokens: ex.type === "grammar_note" ? [] : learnerEnglish(ex).filter((f) => !f.drill && !f.bilingual && !/choices\[/.test(f.field)).flatMap((f) => tokenize(f.text)),
  })));
}

export function checkWordExposure(ctx: RuleContext, fromDay = WORD_EXPOSURE_FROM_DAY): Problem[] {
  const problems: Problem[] = [];
  for (const { file, lesson } of ctx.lessons) {
    if (lesson.day < fromDay) continue;
    const exercises = exposureByExercise(lesson);
    for (const id of lesson.vocab) {
      const entry = ctx.bank.get(id);
      if (!entry) continue;
      const forms = usageForms(entry.item);
      const byType = new Map<string, number>();
      for (const ex of exercises) {
        const n = ex.tokens.filter((t) => forms.has(t)).length;
        if (n > 0) byType.set(ex.type, (byType.get(ex.type) ?? 0) + n);
      }
      const total = [...byType.values()].reduce((a, b) => a + b, 0);
      if (total >= WORD_EXPOSURE_MIN_OCCURRENCES && byType.size >= WORD_EXPOSURE_MIN_TYPES) continue;
      const where = byType.size ? [...byType].map(([t, n]) => `${t}: ${n}`).join(", ") : "none";
      problems.push({
        rule: WORD_EXPOSURE_RULE, file, id, severity: "warning",
        message: `"${entry.item.word}" is a new word of day ${lesson.day} but appears ${plural(total, "time")} in ${plural(byType.size, "exercise type")} outside vocab_match (${where}). A new word needs at least ${WORD_EXPOSURE_MIN_OCCURRENCES} occurrences in at least ${WORD_EXPOSURE_MIN_TYPES} different exercise types of its own lesson: use it in one more listening, speaking, reading or writing exercise.`,
      });
    }
  }
  return problems;
}

export function checkWeekRecycle(ctx: RuleContext, fromWeek = WEEK_RECYCLE_FROM_WEEK): Problem[] {
  const problems: Problem[] = [];
  const weeks = new Map<number, typeof ctx.lessons>();
  for (const l of ctx.lessons) weeks.set(weekOf(l.lesson.day), [...(weeks.get(weekOf(l.lesson.day)) ?? []), l]);
  for (const [week, days] of weeks) {
    if (week < fromWeek) continue;
    const review = days.filter((d) => d.lesson.type === "review" || d.lesson.type === "challenge");
    const teaching = days.filter((d) => d.lesson.type === "lesson");
    if (review.length === 0 || teaching.length === 0) continue;
    const seen = new Set(review.flatMap((d) => tokensByExercise(d.lesson).flatMap((e) => e.tokens)));
    const missing = teaching.flatMap((d) => d.lesson.vocab.flatMap((id) => {
      const entry = ctx.bank.get(id);
      return entry && ![...usageForms(entry.item)].some((f) => seen.has(f)) ? [`"${entry.item.word}" (day ${d.lesson.day})`] : [];
    }));
    if (missing.length === 0) continue;
    const last = review[review.length - 1];
    problems.push({
      rule: WEEK_RECYCLE_RULE, file: last.file, severity: "warning",
      message: `week ${week}: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} taught this week but does not appear on the review or challenge day (days ${review.map((d) => d.lesson.day).join(", ")}) outside vocab_match. Use every word of the week at least once there (a listening, reading or speaking item).`,
    });
  }
  return problems;
}

export function checkVocabMatch(ctx: RuleContext, fromDay = VOCAB_MATCH_FROM_DAY): Problem[] {
  const problems: Problem[] = [];
  for (const { file, lesson } of ctx.lessons) {
    if (lesson.day < fromDay) continue;
    const matches = lesson.sections.flatMap((s) => s.exercises).flatMap((e) => (e.type === "vocab_match" ? [e] : []));
    for (const m of matches) {
      if (m.pairs.length > VOCAB_MATCH_MAX_PAIRS) {
        problems.push({
          rule: VOCAB_MATCH_RULE, file, id: m.id,
          message: `this vocab_match has ${m.pairs.length} pairs but at most ${VOCAB_MATCH_MAX_PAIRS} fit a 360px phone screen. Split it into two vocab_match exercises of at most ${VOCAB_MATCH_MAX_PAIRS} pairs.`,
        });
      }
    }
    if (lesson.vocab.length === 0) continue;
    const covered = new Set(matches.flatMap((m) => m.pairs.map((p) => p.vocabId)));
    const missing = lesson.vocab.filter((id) => !covered.has(id));
    if (missing.length) {
      problems.push({
        rule: VOCAB_MATCH_RULE, file,
        message: `day ${lesson.day} teaches ${lesson.vocab.length} new words but no vocab_match contains ${missing.map((id) => `"${ctx.bank.get(id)?.item.word ?? id}"`).join(", ")}. Add ${missing.length === 1 ? "it" : "them"} to a vocab_match (at most ${VOCAB_MATCH_MAX_PAIRS} pairs each; use a second vocab_match if needed).`,
      });
    }
  }
  return problems;
}

export function checkNewWordsPerDay(ctx: RuleContext, fromDay = GRAMMAR_DAY_FROM_DAY): Problem[] {
  const problems: Problem[] = [];
  for (const { file, lesson } of ctx.lessons) {
    const hasNote = lesson.sections.some((s) => s.exercises.some((e) => e.type === "grammar_note"));
    if (lesson.day < fromDay || !hasNote || lesson.vocab.length <= GRAMMAR_DAY_MAX_NEW_WORDS) continue;
    problems.push({
      rule: NEW_WORDS_RULE, file,
      message: `day ${lesson.day} has a grammar_note (it introduces a grammar form) and teaches ${lesson.vocab.length} new words, but a grammar day teaches at most ${GRAMMAR_DAY_MAX_NEW_WORDS} (owner decision 2026-11-28; other days up to 12). Move ${lesson.vocab.length - GRAMMAR_DAY_MAX_NEW_WORDS} word(s) to a day without a grammar form, or move the grammar form to another day.`,
    });
  }
  return problems;
}
