// Rule "checkpoint": what a monthly checkpoint (content/checkpoints/checkpoint-XXX.json) must satisfy beyond its schema
// (docs/plans/checkpoint-plan.md section 3.1, docs/CONTENT_SCHEMA.md). The rules that read learner-facing text
// (taught-words, grammar-not-yet, pronunciation, ...) already run on checkpoints through `ctx.units`; this file is about
// the structure: ids, sections and weights, which exercise types may be scored, no new words, sound tags, reviewDays,
// and the day-A lesson that unlocks the test. Errors fail the check; the three warnings of item 11 do not.
import { isRetryable } from "@/lib/answers/grade";
import { CHECKPOINT_BANNED_TYPES, CHECKPOINT_MIN_SCORED_EXERCISES, CHECKPOINT_SELF_RATED_TYPES, type CheckpointSection } from "../checkpoint-schema";
import type { LoadedCheckpoint, Problem } from "../loader";
import type { Exercise } from "../schema";
import type { RuleContext } from "./context";

export const CHECKPOINT_RULE = "checkpoint";

const BANNED: readonly string[] = CHECKPOINT_BANNED_TYPES;
const SELF_RATED: readonly string[] = CHECKPOINT_SELF_RATED_TYPES;
const pad3 = (n: number) => String(n).padStart(3, "0");
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();

/** The main text of an exercise that a learner reads or hears, compared with the lessons' for warning "same sentence". */
function mainTexts(ex: Exercise): { field: string; text: string }[] {
  switch (ex.type) {
    case "listen_choose": case "dictation": return [{ field: "audioText", text: ex.audioText }];
    case "repeat_after_me": case "fill_blank": case "read_passage": return [{ field: "text", text: ex.text }];
    case "arrange_words": return [{ field: "answer", text: ex.answer }];
    case "translate_th_en": return [{ field: "th", text: ex.th }];
    default: return [];
  }
}

function checkOne(ctx: RuleContext, { file, checkpoint: cp }: LoadedCheckpoint): Problem[] {
  const A = cp.afterDay;
  const problems: Problem[] = [];
  const err = (message: string, id?: string) => problems.push({ rule: CHECKPOINT_RULE, file, id, message });
  const warn = (message: string, id?: string) => problems.push({ rule: CHECKPOINT_RULE, file, id, message, severity: "warning" });

  // file name (item 1)
  const named = /checkpoint-(\d{3})\.json$/.exec(file);
  if (named && Number(named[1]) !== A) err(`afterDay ${A} does not match file name checkpoint-${named[1]}.json (expected checkpoint-${pad3(A)}.json)`);

  // the lesson of day A must exist, or the checkpoint can never be unlocked (item 10)
  const lessonByDay = new Map(ctx.lessons.map((l) => [l.lesson.day, l]));
  if (!lessonByDay.has(A)) err(`there is no lesson file for day ${A} (content/lessons/day-${pad3(A)}.json); the checkpoint opens when day ${A} is finished, so without that lesson it can never be unlocked`);

  // sections: one per skill, weights add up to 100 (item 3)
  const bySkill = new Map<string, number>();
  for (const s of cp.sections) bySkill.set(s.skill, (bySkill.get(s.skill) ?? 0) + 1);
  for (const [skill, n] of bySkill) if (n > 1) err(`skill "${skill}" has ${n} sections; a checkpoint has at most one section per skill`);
  const total = cp.sections.reduce((sum, s) => sum + s.weight, 0);
  if (total !== 100) err(`section weights add up to ${total}, not 100`);

  // phoneme codes taught or tagged in lessons up to day A (item 8)
  const known = new Set<string>();
  for (const { lesson } of ctx.lessons) {
    if (lesson.day > A) continue;
    for (const s of lesson.sections) for (const e of s.exercises) {
      if (e.type === "phoneme_intro") known.add(e.phoneme);
      for (const c of e.phonemes ?? []) known.add(c);
    }
  }

  for (const section of cp.sections) {
    checkSection(section);
    checkReviewDays(section);
  }

  function checkSection(section: CheckpointSection) {
    const scored = section.weight > 0;
    const where = `section "${section.skill}" (weight ${section.weight})`;
    if (scored && section.exercises.length < CHECKPOINT_MIN_SCORED_EXERCISES) {
      err(`${where} has ${section.exercises.length} exercise(s); a scored section needs at least ${CHECKPOINT_MIN_SCORED_EXERCISES} so one lucky answer cannot decide it`);
    }
    for (const ex of section.exercises) {
      // ids (item 2)
      const id = /^([dc])(\d{3})-/.exec(ex.id);
      if (id && id[1] !== "c") err(`exercise id ${ex.id} must start with c${pad3(A)}- (checkpoint ids are cXXX-<skill>-NN; dXXX ids belong to lesson files)`, ex.id);
      else if (id && Number(id[2]) !== A) err(`exercise id day ${Number(id[2])} does not match afterDay ${A} (expected c${pad3(A)}-<skill>-NN)`, ex.id);

      // types (items 4, 5)
      if (BANNED.includes(ex.type)) {
        err(`type "${ex.type}" is not allowed in a checkpoint (never allowed: ${CHECKPOINT_BANNED_TYPES.join(", ")})`, ex.id);
      } else if (scored && !isRetryable(ex.type)) {
        err(`${ex.type} is self-rated, so it cannot be in ${where}: a scored section may only hold automatically graded exercises. Move it to a section with weight 0, or use another type`, ex.id);
      } else if (!scored && !SELF_RATED.includes(ex.type)) {
        err(`section "${section.skill}" has weight 0 so every exercise must be self-rated (${CHECKPOINT_SELF_RATED_TYPES.join(", ")}), but this is ${ex.type}. Give the section a weight, or use a self-rated type`, ex.id);
      }

      // no new words (item 7)
      if (ex.type === "read_passage" && ex.glossary) {
        err(`read_passage must not have a "glossary": a checkpoint introduces no new words, and the glossary is the one place the taught-words rule lets an untaught word through. Remove it and use only words taught by day ${A}`, ex.id);
      }
      if (ex.type === "vocab_match") {
        for (const { vocabId } of ex.pairs) {
          const entry = ctx.bank.get(vocabId);
          if (!entry) continue; // "not in the vocab bank" is reported by checkContent
          const taught = ctx.taughtIn.get(vocabId);
          if (!taught) err(`vocab_match uses "${entry.item.word}" (${vocabId}), which is not taught in any lesson; a checkpoint after day ${A} may only use words taught by day ${A}`, ex.id);
          else if (taught.day > A) err(`vocab_match uses "${entry.item.word}" (${vocabId}), which is first taught on day ${taught.day}, after day ${A}; a checkpoint may only use words taught by day ${A}`, ex.id);
        }
      }

      // sound tags (item 8)
      if (section.skill === "pronunciation" || ex.type === "minimal_pair") {
        if (!ex.phonemes) {
          err(`${ex.type} has no "phonemes": a checkpoint has no phoneme_intro to give the sound tag, so without it a miss would carry no sound. Add "phonemes": [...] with the code(s) of the sound(s) it practises (the codes of phoneme_intro.phoneme: ${[...known].sort().join(", ") || "none yet"})`, ex.id);
        }
      }
      for (const code of ex.phonemes ?? []) {
        if (!known.has(code)) err(`phonemes code "${code}" does not appear in days 1-${A} (no phoneme_intro.phoneme or phonemes array uses it), so it is probably a typo. Codes in use: ${[...known].sort().join(", ") || "none"}`, ex.id);
      }
    }
  }

  // reviewDays (item 9)
  function checkReviewDays(section: CheckpointSection) {
    for (const day of section.reviewDays) {
      const at = `section "${section.skill}" reviewDays`;
      const lesson = lessonByDay.get(day);
      if (day > A) err(`${at}: day ${day} is after day ${A}; the remedial replay may only use finished days (<= ${A})`);
      else if (!lesson) err(`${at}: day ${day} has no lesson file, so the replay link would be broken`);
      else if (!lesson.lesson.sections.some((s) => s.skill === section.skill)) err(`${at}: day ${day} has no "${section.skill}" section, so there is nothing to replay`);
    }
  }

  // warnings (item 11)
  const tagged = new Set(cp.sections.flatMap((s) => s.exercises.flatMap((e) => e.phonemes ?? [])));
  const warnedCodes = new Set<string>();
  for (const { lesson } of ctx.lessons) {
    if (lesson.day > A || lesson.day < A - 29) continue;
    for (const s of lesson.sections) for (const e of s.exercises) {
      if (e.type !== "phoneme_intro" || tagged.has(e.phoneme) || warnedCodes.has(e.phoneme)) continue;
      warnedCodes.add(e.phoneme);
      warn(`phoneme "${e.phoneme}" is taught on day ${lesson.day} (within the 30 days before this checkpoint) but no exercise has it in "phonemes", so the checkpoint never tests it. Add an exercise for it or tag an existing one`);
    }
  }
  const seen = new Map<string, { id: string; field: string }>();
  for (const { lesson } of ctx.lessons) {
    if (lesson.day > A) continue;
    for (const s of lesson.sections) for (const e of s.exercises) for (const m of mainTexts(e)) if (!seen.has(norm(m.text))) seen.set(norm(m.text), { id: e.id, field: m.field });
  }
  for (const section of cp.sections) {
    for (const ex of section.exercises) {
      for (const m of mainTexts(ex)) {
        const same = seen.get(norm(m.text));
        if (same && norm(m.text)) warn(`${m.field} "${m.text}" is the same as ${same.id} (${same.field}) in a lesson up to day ${A}; a checkpoint should use a new sentence made of known words, not one the learner has seen`, ex.id);
      }
    }
  }
  if (cp.estimatedMinutes < 20 || cp.estimatedMinutes > 45) warn(`estimatedMinutes ${cp.estimatedMinutes} is outside 20-45; check that the number of exercises matches`);
  return problems;
}

export function checkCheckpoints(ctx: RuleContext): Problem[] {
  return ctx.checkpoints.flatMap((c) => checkOne(ctx, c));
}
