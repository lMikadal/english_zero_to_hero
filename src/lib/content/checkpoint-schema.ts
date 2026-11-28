// Zod schema for the monthly checkpoint files content/checkpoints/checkpoint-XXX.json. Keep in sync with docs/CONTENT_SCHEMA.md.
// Client-safe (like schema.ts): only zod and schema.ts. Cross-file rules live in rules/checkpoint.ts.
import { z } from "zod";
import { CEFR_LEVELS, bilingual, sectionSchema } from "./schema";

/** A checkpoint is taken after every 30th day. */
export const CHECKPOINT_INTERVAL = 30;
export const isCheckpointDay = (n: number) => Number.isInteger(n) && n >= 30 && n <= 360 && n % CHECKPOINT_INTERVAL === 0;
/** A section that counts towards the score needs at least this many exercises (rule "checkpoint"). */
export const CHECKPOINT_MIN_SCORED_EXERCISES = 3;

/** Exercise types a checkpoint never holds: `phoneme_intro` teaches, `free_write` and `roleplay` cannot be graded, `spell_word` and `use_in_sentence` practise one new word. */
export const CHECKPOINT_BANNED_TYPES = ["phoneme_intro", "free_write", "roleplay", "spell_word", "use_in_sentence"] as const;
/** The only types of a weight-0 (not scored) section: the learner rates themselves. Every other allowed type is graded automatically (`isRetryable`). */
export const CHECKPOINT_SELF_RATED_TYPES = ["repeat_after_me", "shadowing", "speak_answer"] as const;

/** `.extend()` of the strict `sectionSchema` stays strict (checkpoint-schema.test.ts proves it). */
export const checkpointSectionSchema = sectionSchema.extend({
  /** Share of the total score, 0..100. 0 = shown but not scored (self-rated speaking). */
  weight: z.number().int().min(0).max(100),
  /** Finished days whose section of this skill is offered as remedial replay. */
  reviewDays: z.array(z.number().int().min(1).max(365)).min(1).max(4),
});

export const checkpointSchema = z.strictObject({
  afterDay: z.number().int().refine(isCheckpointDay, "afterDay must be 30, 60, ... 360 (a multiple of 30)"),
  cefr: z.enum(CEFR_LEVELS),
  title: bilingual,
  estimatedMinutes: z.number().int().positive(),
  sections: z.array(checkpointSectionSchema).min(1),
});

export type Checkpoint = z.infer<typeof checkpointSchema>;
export type CheckpointSection = z.infer<typeof checkpointSectionSchema>;
