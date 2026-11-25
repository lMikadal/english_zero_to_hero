import { expect, expectTypeOf, it } from "vitest";
import type { Grade } from "@/lib/answers/grade";
import type { AttemptAnswer } from "@/lib/attempts/contract";
import type { ExerciseOf, ExerciseType } from "@/lib/content/schema";
import type { AnswerFor, ExerciseProps, VocabLookup } from "./types";

type Kind<K extends AttemptAnswer["kind"]> = Extract<AttemptAnswer, { kind: K }>;

it("AnswerFor maps each graded type to the answer kind that gradeExercise expects", () => {
  expectTypeOf<AnswerFor<"listen_choose">>().toEqualTypeOf<Kind<"choice">>();
  expectTypeOf<AnswerFor<"read_passage">>().toEqualTypeOf<Kind<"choices">>();
  expectTypeOf<AnswerFor<"minimal_pair">>().toEqualTypeOf<Kind<"pairs">>();
  expectTypeOf<AnswerFor<"dictation">>().toEqualTypeOf<Kind<"text">>();
  expectTypeOf<AnswerFor<"translate_th_en">>().toEqualTypeOf<Kind<"text">>();
  expectTypeOf<AnswerFor<"arrange_words">>().toEqualTypeOf<Kind<"text">>();
  expectTypeOf<AnswerFor<"free_write">>().toEqualTypeOf<Kind<"text">>();
  expectTypeOf<AnswerFor<"fill_blank">>().toEqualTypeOf<Kind<"texts">>();
  expectTypeOf<AnswerFor<"vocab_match">>().toEqualTypeOf<Kind<"match">>();
  expectTypeOf<AnswerFor<"repeat_after_me">>().toEqualTypeOf<Kind<"self">>();
  expectTypeOf<AnswerFor<"shadowing">>().toEqualTypeOf<Kind<"self">>();
  expectTypeOf<AnswerFor<"speak_answer">>().toEqualTypeOf<Kind<"self">>();
  expectTypeOf<AnswerFor<"phoneme_intro">>().toEqualTypeOf<never>();
  expect(true).toBe(true);
});

it("ExerciseProps carries the exercise, the vocab lookup, onAnswer and an optional result", () => {
  expectTypeOf<ExerciseProps<"dictation">["exercise"]>().toEqualTypeOf<ExerciseOf<"dictation">>();
  expectTypeOf<ExerciseProps<"dictation">["vocab"]>().toEqualTypeOf<VocabLookup>();
  expectTypeOf<ExerciseProps<"dictation">["onAnswer"]>().toEqualTypeOf<(answer: Kind<"text">) => void>();
  expectTypeOf<ExerciseProps<"dictation">["result"]>().toEqualTypeOf<Grade | undefined>();
  expectTypeOf<VocabLookup[string]>().toEqualTypeOf<{ word: string; th: string; ipa: { us: string; uk: string } }>();
  expectTypeOf<ExerciseType>().not.toBeNever();
  expect(true).toBe(true);
});
