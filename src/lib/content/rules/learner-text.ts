// The English a learner sees or hears in an exercise, field by field. Thai text and instructions are not listed.
import type { Exercise } from "../schema";

export type LearnerField = {
  /** Path inside the exercise, e.g. "questions[0].choices[1]". */
  field: string;
  text: string;
  /** Pure sound drills (phoneme examples, minimal pairs): words to hear, not sentences to understand. */
  drill?: boolean;
  /** Shown with a Thai translation next to it ({ en, th }): the learner is not expected to know every word. */
  bilingual?: boolean;
};

export function learnerEnglish(ex: Exercise): LearnerField[] {
  const list = (name: string, xs: readonly string[], drill?: boolean): LearnerField[] => xs.map((text, i) => ({ field: `${name}[${i}]`, text, ...(drill ? { drill } : {}) }));
  const bi = (field: string, text: string): LearnerField => ({ field, text, bilingual: true });
  switch (ex.type) {
    case "phoneme_intro": return list("examples", ex.examples, true);
    case "minimal_pair": return ex.pairs.flatMap((p, i) => [{ field: `pairs[${i}].a`, text: p.a, drill: true }, { field: `pairs[${i}].b`, text: p.b, drill: true }]);
    case "repeat_after_me": return [{ field: "text", text: ex.text }];
    case "listen_choose":
      return [{ field: "audioText", text: ex.audioText }, bi("question", ex.question.en), ...list("choices", ex.choices)];
    case "dictation": return [{ field: "audioText", text: ex.audioText }];
    case "shadowing": return list("lines", ex.lines);
    case "speak_answer": return [{ field: "prompt", text: ex.prompt }, { field: "sampleAnswer", text: ex.sampleAnswer }];
    case "roleplay": return [bi("scenario", ex.scenario.en), ...ex.goals.map((g, i) => bi(`goals[${i}]`, g.en))];
    case "read_passage":
      return [
        { field: "text", text: ex.text },
        ...ex.questions.flatMap((q, i) => [bi(`questions[${i}].question`, q.question.en), ...list(`questions[${i}].choices`, q.choices)]),
      ];
    case "arrange_words": return [{ field: "answer", text: ex.answer }];
    case "fill_blank": return [{ field: "text", text: ex.text }, ...list("answer", ex.answer)];
    case "translate_th_en": return [{ field: "accept[0]", text: ex.accept[0] }];
    // the Thai instruction restates the task, so the English prompt is a bilingual task statement
    case "free_write":
    case "use_in_sentence": return [{ field: "prompt", text: ex.prompt, bilingual: true }];
    // the English of a grammar card: the examples, and every table cell that has no Thai letter
    case "grammar_note":
      return [
        ...ex.examples.map((e, i) => ({ field: `examples[${i}].en`, text: e.en })),
        ...(ex.table ?? []).flatMap((row, r) => row.flatMap((cell, c) => (/[\u0E00-\u0E7F]/.test(cell) ? [] : [{ field: `table[${r}][${c}]`, text: cell }]))),
      ];
    case "vocab_match":
    case "spell_word": return [];
  }
}

/** Words a read_passage explains in Thai (glossary keys): allowed inside that exercise even if not taught. */
export function glossedWords(ex: Exercise): string[] {
  return ex.type === "read_passage" ? Object.keys(ex.glossary ?? {}) : [];
}
