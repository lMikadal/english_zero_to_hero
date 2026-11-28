// Zod schemas for lesson and vocab files. Keep in sync with docs/CONTENT_SCHEMA.md.
// Every object is strict: unknown keys are errors, so typos in content are caught.
import { z } from "zod";

export const CEFR_LEVELS = ["preA1", "A1", "A2", "B1", "B2", "C1"] as const;
export const VOCAB_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export const SKILLS = ["pronunciation", "listening", "speaking", "reading", "writing"] as const;
export const LESSON_TYPES = ["lesson", "review", "challenge"] as const;

/** Topic slugs from docs/VOCABULARY.md section 3. */
export const TOPICS = [
  "greetings", "people_family", "body_health", "food_drink", "home", "daily_routine", "time_dates",
  "numbers_money", "shopping", "clothes", "places_city", "travel_transport", "work_study",
  "weather_nature", "hobbies_sport", "technology", "feelings", "communication", "function_words",
] as const;

const text = z.string().refine((s) => s.length > 0 && s.trim() === s, "must not be empty or have leading/trailing whitespace");
const thai = text.refine((s) => /[\u0E00-\u0E7F]/.test(s), "must contain Thai characters");
export const bilingual = z.strictObject({ en: text, th: thai });
export const VOCAB_ID_PATTERN = /^v-[a-z0-9]+(-[a-z0-9]+)*$/;
const vocabId = z.string().regex(VOCAB_ID_PATTERN, "vocab id must look like v-word or v-word-pos");
/** `dXXX-<skill>-NN` (lesson) or `cXXX-<skill>-NN` (monthly checkpoint, XXX = afterDay); also used by the attempts API contract. The validator checks that a file only holds ids of its own kind. */
export const EXERCISE_ID_PATTERN = /^[dc]\d{3}-(pron|listen|speak|read|write|vocab)-\d{2}$/;
const exerciseId = z.string().regex(EXERCISE_ID_PATTERN, "exercise id must look like dXXX-<skill>-NN (lesson) or cXXX-<skill>-NN (checkpoint), skill = pron|listen|speak|read|write|vocab");
const choiceIndex = z.number().int().nonnegative();

const base = {
  id: exerciseId,
  instruction: z.strictObject({ th: thai, en: text.optional() }),
  /** Phoneme codes (same alphabet as `phoneme_intro.phoneme`); when present they define the exercise's `phoneme:` tags. */
  phonemes: z.array(text).min(1).optional(),
};

export const phonemeIntroSchema = z.strictObject({
  ...base, type: z.literal("phoneme_intro"),
  phoneme: text, ipa: text, tipTh: thai, examples: z.array(text).min(1),
});
export const minimalPairSchema = z.strictObject({
  ...base, type: z.literal("minimal_pair"),
  pairs: z.array(z.strictObject({ a: text, b: text, answer: z.enum(["a", "b"]) })).min(1),
});
export const repeatAfterMeSchema = z.strictObject({
  ...base, type: z.literal("repeat_after_me"), text, ipa: text.optional(),
});
export const listenChooseSchema = z.strictObject({
  ...base, type: z.literal("listen_choose"),
  audioText: text, question: bilingual, choices: z.array(text).min(2), answer: choiceIndex,
});
/** `strict: true` turns off the contraction / digit folding for this item (case and punctuation are still ignored). */
const strict = z.boolean().optional();
export const dictationSchema = z.strictObject({
  ...base, type: z.literal("dictation"), audioText: text, accept: z.array(text).min(1).optional(), strict,
});
export const shadowingSchema = z.strictObject({
  ...base, type: z.literal("shadowing"), lines: z.array(text).min(1),
});
export const speakAnswerSchema = z.strictObject({
  ...base, type: z.literal("speak_answer"),
  prompt: text, sampleAnswer: text, keywords: z.array(text).min(1).optional(),
});
export const roleplaySchema = z.strictObject({
  ...base, type: z.literal("roleplay"),
  scenario: bilingual, aiRole: text, goals: z.array(bilingual).min(1),
});
export const readPassageSchema = z.strictObject({
  ...base, type: z.literal("read_passage"),
  text, glossary: z.record(z.string(), thai).optional(),
  questions: z.array(z.strictObject({ question: bilingual, choices: z.array(text).min(2), answer: choiceIndex })).min(1),
});
/** `statementOnly: true` tells rule "arrange-question" that the yes/no question built from the same tiles is NOT an accepted answer here. */
export const arrangeWordsSchema = z.strictObject({
  ...base, type: z.literal("arrange_words"), words: z.array(text).min(2), answer: text, accept: z.array(text).min(1).optional(),
  statementOnly: z.boolean().optional(),
});
export const fillBlankSchema = z.strictObject({
  ...base, type: z.literal("fill_blank"), text, answer: z.array(text).min(1), strict,
});
export const translateThEnSchema = z.strictObject({
  ...base, type: z.literal("translate_th_en"), th: thai, accept: z.array(text).min(1), strict,
});
export const freeWriteSchema = z.strictObject({
  ...base, type: z.literal("free_write"),
  prompt: text, minWords: z.number().int().positive(), rubric: z.array(text).min(1).optional(),
});
export const vocabMatchSchema = z.strictObject({
  ...base, type: z.literal("vocab_match"),
  pairs: z.array(z.strictObject({ vocabId })).min(2),
});
export const spellWordSchema = z.strictObject({
  ...base, type: z.literal("spell_word"), vocabId,
});
export const useInSentenceSchema = z.strictObject({
  ...base, type: z.literal("use_in_sentence"), vocabId, prompt: text,
});

export const exerciseSchema = z.discriminatedUnion("type", [
  phonemeIntroSchema, minimalPairSchema, repeatAfterMeSchema, listenChooseSchema, dictationSchema,
  shadowingSchema, speakAnswerSchema, roleplaySchema, readPassageSchema, arrangeWordsSchema,
  fillBlankSchema, translateThEnSchema, freeWriteSchema, vocabMatchSchema, spellWordSchema,
  useInSentenceSchema,
]);
export const EXERCISE_TYPES = exerciseSchema.options.map((o) => o.shape.type.value);

export const sectionSchema = z.strictObject({
  skill: z.enum(SKILLS), title: bilingual, exercises: z.array(exerciseSchema).min(1),
});

export const lessonSchema = z.strictObject({
  day: z.number().int().min(1).max(365),
  phase: z.number().int().min(1).max(4),
  week: z.number().int().min(1).max(53),
  type: z.enum(LESSON_TYPES),
  cefr: z.enum(CEFR_LEVELS),
  title: bilingual,
  objectives: z.array(bilingual).min(1),
  estimatedMinutes: z.number().int().positive(),
  vocab: z.array(vocabId),
  sections: z.array(sectionSchema).min(1),
});

export const vocabItemSchema = z.strictObject({
  id: vocabId,
  word: text,
  pos: text,
  oxford: z
    .strictObject({ list: z.enum(["3000", "5000"]), level: z.enum(VOCAB_LEVELS) })
    .refine((o) => (o.list === "3000" ? o.level !== "C1" : o.level === "B2" || o.level === "C1"), {
      message: "Oxford 3000 covers A1-B2 and Oxford 5000 covers B2-C1",
      path: ["level"],
    }),
  ipa: z.strictObject({ us: text, uk: text }),
  th: thai,
  topics: z.array(
    z.enum(TOPICS, { error: (iss) => `unknown topic "${String(iss.input)}" (see docs/VOCABULARY.md section 3)` }),
  ).min(1),
  examples: z.array(bilingual).min(1),
  collocations: z.array(text).optional(),
  forms: z.record(z.string(), text).optional(),
});
export const vocabFileSchema = z.array(vocabItemSchema);

export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseType = Exercise["type"];
export type ExerciseOf<T extends ExerciseType> = Extract<Exercise, { type: T }>;
export type Section = z.infer<typeof sectionSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type VocabItem = z.infer<typeof vocabItemSchema>;
export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type Topic = (typeof TOPICS)[number];
