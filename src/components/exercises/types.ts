// Props shared by every exercise component. Types only (client-safe).
// A component owns its input and its own check button and calls `onAnswer` once per exercise; the player
// grades the answer (gradeExercise) and shows the feedback bar and the next button.
import type { Grade } from "@/lib/answers/grade";
import type { AttemptAnswer } from "@/lib/attempts/contract";
import type { ExerciseOf, ExerciseType } from "@/lib/content/schema";

export type VocabLookup = Record<string, { word: string; th: string; ipa: { us: string; uk: string } }>;

type Kind<K extends AttemptAnswer["kind"]> = Extract<AttemptAnswer, { kind: K }>;
type AnswerByType = {
  listen_choose: Kind<"choice">;
  read_passage: Kind<"choices">;
  minimal_pair: Kind<"pairs">;
  dictation: Kind<"text">;
  translate_th_en: Kind<"text">;
  arrange_words: Kind<"text">;
  free_write: Kind<"text">;
  fill_blank: Kind<"texts">;
  vocab_match: Kind<"match">;
  repeat_after_me: Kind<"self">;
  shadowing: Kind<"self">;
  speak_answer: Kind<"self">;
};

/** The answer kind a type produces; `never` for types that have no attempt (phoneme_intro, unsupported types). */
export type AnswerFor<T extends ExerciseType> = T extends keyof AnswerByType ? AnswerByType[T] : never;

/**
 * Rules for components:
 * - Call `onAnswer` once per exercise, with a complete answer.
 * - Types with no attempt (`phoneme_intro`) and "skip" when audio is unavailable call `onContinue`, never `onAnswer`.
 * - Get audio from `useAudio()` (src/lib/audio/context.tsx), not from props.
 * - `result` is set after answering: lock the inputs, highlight right and wrong, and use `result.items` (one
 *   boolean per item in exercise order, for multi-item types) to show which item was wrong.
 * - In the end-of-lesson retry round the player remounts the component with
 *   `key={`${exercise.id}-${attemptNo}`}` and `result` undefined. Hold no state outside React state (no module
 *   variables, no refs that outlive the mount) so a remount starts clean.
 */
export type ExerciseProps<T extends ExerciseType> = {
  exercise: ExerciseOf<T>;
  vocab: VocabLookup;
  onAnswer(answer: AnswerFor<T>): void;
  onContinue(): void;
  result?: Grade;
  /**
   * Default true. `false` (the monthly checkpoint, docs/plans/checkpoint-plan.md D5): with a `result` the exercise still locks and
   * hides its confirm button, but shows nothing about right or wrong: no colour, `Mark`, `data-state` right/wrong, `aria-invalid`,
   * correct-answer text, and the screen is identical for a right and a wrong answer. Components read `result` only for locking
   * and take everything shown from `shown(result, reveal)`; never read `result.correct` / `result.items` outside that.
   */
  reveal?: boolean;
};

/** The result a component may draw: `undefined` when the exercise is concealed (it still uses the real `result` to lock). */
export const shown = (result: Grade | undefined, reveal: boolean): Grade | undefined => (reveal ? result : undefined);
