// Which exercise component renders which type. A plain switch (not a lookup table) so every case is checked
// against the exercise's own type with no casts. A type that is missing (roleplay, spell_word, use_in_sentence)
// returns null and the player shows "ยังไม่รองรับ".
import type { ReactNode } from "react";
import type { Grade } from "@/lib/answers/grade";
import type { AttemptAnswer } from "@/lib/attempts/contract";
import type { Exercise, ExerciseType } from "@/lib/content/schema";
import { ArrangeWords } from "./ArrangeWords";
import { Dictation } from "./Dictation";
import { FillBlank } from "./FillBlank";
import { FreeWrite } from "./FreeWrite";
import { ListenChoose } from "./ListenChoose";
import { MinimalPair } from "./MinimalPair";
import { PhonemeIntro } from "./PhonemeIntro";
import { ReadPassage } from "./ReadPassage";
import { RepeatAfterMe } from "./RepeatAfterMe";
import { Shadowing } from "./Shadowing";
import { SpeakAnswer } from "./SpeakAnswer";
import { TranslateThEn } from "./TranslateThEn";
import type { VocabLookup } from "./types";
import { VocabMatch } from "./VocabMatch";

export const REGISTERED_TYPES = [
  "phoneme_intro", "minimal_pair", "listen_choose", "dictation", "repeat_after_me", "shadowing", "speak_answer",
  "read_passage", "arrange_words", "fill_blank", "translate_th_en", "free_write", "vocab_match",
] as const satisfies readonly ExerciseType[];

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
    case "speak_answer": return <SpeakAnswer exercise={exercise} {...h} />;
    case "read_passage": return <ReadPassage exercise={exercise} {...h} />;
    case "arrange_words": return <ArrangeWords exercise={exercise} {...h} />;
    case "fill_blank": return <FillBlank exercise={exercise} {...h} />;
    case "translate_th_en": return <TranslateThEn exercise={exercise} {...h} />;
    case "free_write": return <FreeWrite exercise={exercise} {...h} />;
    case "vocab_match": return <VocabMatch exercise={exercise} {...h} />;
    default: return null;
  }
}
