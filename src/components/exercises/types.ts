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

export type ExerciseProps<T extends ExerciseType> = {
  exercise: ExerciseOf<T>;
  vocab: VocabLookup;
  onAnswer(answer: AnswerFor<T>): void;
  /** Set after answering: lock the inputs and highlight right and wrong. */
  result?: Grade;
};
