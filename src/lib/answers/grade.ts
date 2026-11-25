// Pure grading shared by the client (instant feedback) and the server (what is stored).
// Client-safe: imports only types, plus normalize. Rules are documented in docs/ARCHITECTURE.md section 5.1
// and docs/CONTENT_SCHEMA.md. Every score is a fraction 0..1; null means "not scored".
import type { AttemptAnswer } from "@/lib/attempts/contract";
import type { Exercise, ExerciseType } from "@/lib/content/schema";
import { matchesAny } from "./normalize";

export type Grade = { correct: boolean; score: number | null };
export type GradeError = { error: "kind_mismatch" | "unsupported" };

/** Shown to the learner but never stored as an attempt. */
export const UNGRADED_TYPES = ["phoneme_intro"] as const;

/** The 13 types that appear in days 1-7. Others (roleplay, spell_word, use_in_sentence) are `unsupported`. */
export const SUPPORTED_TYPES = [
  "phoneme_intro", "minimal_pair", "repeat_after_me", "listen_choose", "dictation", "shadowing", "speak_answer",
  "read_passage", "arrange_words", "fill_blank", "translate_th_en", "free_write", "vocab_match",
] as const satisfies readonly ExerciseType[];

/** Auto-graded types: the only ones that come back in the end-of-lesson retry round. */
export const RETRYABLE_TYPES = [
  "listen_choose", "read_passage", "minimal_pair", "dictation", "translate_th_en", "arrange_words", "fill_blank", "vocab_match",
] as const satisfies readonly ExerciseType[];

export function isRetryable(type: ExerciseType): boolean {
  return (RETRYABLE_TYPES as readonly string[]).includes(type);
}

export function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const MISMATCH: GradeError = { error: "kind_mismatch" };

/** Fully right is `correct`; the score is the fraction of right items. */
function fraction(right: number, total: number): Grade {
  return { correct: right === total, score: total === 0 ? 0 : right / total };
}
const exact = (ok: boolean): Grade => ({ correct: ok, score: ok ? 1 : 0 });

export function gradeExercise(ex: Exercise, answer: AttemptAnswer): Grade | GradeError {
  switch (ex.type) {
    case "listen_choose":
      return answer.kind === "choice" ? exact(answer.selected === ex.answer) : MISMATCH;
    case "read_passage": {
      if (answer.kind !== "choices" || answer.selected.length !== ex.questions.length) return MISMATCH;
      return fraction(ex.questions.filter((q, i) => answer.selected[i] === q.answer).length, ex.questions.length);
    }
    case "minimal_pair": {
      if (answer.kind !== "pairs" || answer.selected.length !== ex.pairs.length) return MISMATCH;
      return fraction(ex.pairs.filter((p, i) => answer.selected[i] === p.answer).length, ex.pairs.length);
    }
    case "dictation":
      return answer.kind === "text" ? exact(matchesAny(answer.text, [...(ex.accept ?? []), ex.audioText])) : MISMATCH;
    case "translate_th_en":
      return answer.kind === "text" ? exact(matchesAny(answer.text, ex.accept)) : MISMATCH;
    case "arrange_words":
      return answer.kind === "text" ? exact(matchesAny(answer.text, [ex.answer])) : MISMATCH;
    case "fill_blank": {
      if (answer.kind !== "texts" || answer.texts.length !== ex.answer.length) return MISMATCH;
      return fraction(ex.answer.filter((a, i) => matchesAny(answer.texts[i], [a])).length, ex.answer.length);
    }
    case "vocab_match": {
      if (answer.kind !== "match") return MISMATCH;
      return fraction(ex.pairs.filter((p) => answer.pairs[p.vocabId] === p.vocabId).length, ex.pairs.length);
    }
    case "repeat_after_me":
    case "shadowing":
    case "speak_answer":
      return answer.kind === "self" ? { correct: answer.rating === "ok", score: null } : MISMATCH;
    case "free_write":
      return answer.kind === "text" ? { correct: countWords(answer.text) >= ex.minWords, score: null } : MISMATCH;
    default:
      return { error: "unsupported" }; // phoneme_intro, roleplay, spell_word, use_in_sentence
  }
}

/** What the feedback bar shows after a wrong answer; null when there is nothing to reveal. */
export function correctAnswerText(ex: Exercise): string | null {
  switch (ex.type) {
    case "listen_choose": return ex.choices[ex.answer];
    case "read_passage": return ex.questions.map((q) => q.choices[q.answer]).join(", ");
    case "minimal_pair": return ex.pairs.map((p) => p[p.answer]).join(", ");
    case "dictation": return ex.audioText;
    case "translate_th_en": return ex.accept[0];
    case "arrange_words": return ex.answer;
    case "fill_blank": return ex.answer.join(", ");
    default: return null;
  }
}

