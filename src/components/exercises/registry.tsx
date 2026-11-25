// Which exercise component renders which type. A plain switch (not a lookup table) so every case is checked
// against the exercise's own type with no casts. The wiring PR adds the text-based components here; a type that
// is missing returns null and the player shows "ยังไม่รองรับ".
import type { ReactNode } from "react";
import type { Grade } from "@/lib/answers/grade";
import type { AttemptAnswer } from "@/lib/attempts/contract";
import type { Exercise, ExerciseType } from "@/lib/content/schema";
import { Dictation } from "./Dictation";
import { ListenChoose } from "./ListenChoose";
import { MinimalPair } from "./MinimalPair";
import { PhonemeIntro } from "./PhonemeIntro";
import { RepeatAfterMe } from "./RepeatAfterMe";
import { Shadowing } from "./Shadowing";
import type { VocabLookup } from "./types";

export const REGISTERED_TYPES = ["phoneme_intro", "minimal_pair", "listen_choose", "dictation", "repeat_after_me", "shadowing"] as const satisfies readonly ExerciseType[];

export const isRegistered = (type: ExerciseType): boolean => (REGISTERED_TYPES as readonly string[]).includes(type);

export type ExerciseHandlers = {
  vocab: VocabLookup;
  onAnswer(answer: AttemptAnswer): void;
  onContinue(): void;
  result?: Grade;
};

export function renderExercise(exercise: Exercise, h: ExerciseHandlers): ReactNode {
  switch (exercise.type) {
    case "phoneme_intro": return <PhonemeIntro exercise={exercise} {...h} />;
    case "minimal_pair": return <MinimalPair exercise={exercise} {...h} />;
    case "listen_choose": return <ListenChoose exercise={exercise} {...h} />;
    case "dictation": return <Dictation exercise={exercise} {...h} />;
    case "repeat_after_me": return <RepeatAfterMe exercise={exercise} {...h} />;
    case "shadowing": return <Shadowing exercise={exercise} {...h} />;
    default: return null;
  }
}
