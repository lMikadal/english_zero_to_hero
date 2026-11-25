// Cross-file content rules (docs/VOCABULARY.md section 6, docs/TESTING.md). Pure: no file IO except validateContentDir.
import path from "node:path";
import { readContent, formatProblem, type ContentData, type Problem } from "./loader";
import { CEFR_LEVELS, TOPICS, type CefrLevel, type Exercise, type VocabItem } from "./schema";

export { formatProblem };
export type { ContentData, LoadedLesson, LoadedVocab, Problem } from "./loader";

export type Summary = { lessons: number; words: number; introduced: number; notIntroduced: number };

const topicSet = new Set<string>(TOPICS);
const rank = (l: CefrLevel) => CEFR_LEVELS.indexOf(l);

/** A preA1 lesson may introduce A1 words: phase 1 teaches the commonest A1 words to pre-A1 learners. */
export function levelAllowed(wordLevel: VocabItem["oxford"]["level"], lessonCefr: CefrLevel): boolean {
  if (lessonCefr === "preA1") return wordLevel === "A1";
  return rank(wordLevel) <= rank(lessonCefr);
}

function vocabRefs(ex: Exercise): string[] {
  switch (ex.type) {
    case "vocab_match": return ex.pairs.map((p) => p.vocabId);
    case "spell_word":
    case "use_in_sentence": return [ex.vocabId];
    default: return [];
  }
}

function answerProblems(ex: Exercise): string[] {
  switch (ex.type) {
    case "listen_choose":
      return ex.answer < ex.choices.length ? [] : [`answer ${ex.answer} is not an index into choices (0-${ex.choices.length - 1})`];
    case "read_passage":
      return ex.questions.flatMap((q, i) =>
        q.answer < q.choices.length ? [] : [`questions[${i}].answer ${q.answer} is not an index into choices (0-${q.choices.length - 1})`]);
    case "arrange_words": {
      const norm = (xs: string[]) => [...xs].sort().join("\u0000");
      const got = ex.answer.split(/\s+/).filter(Boolean);
      return norm(got) === norm(ex.words) ? [] : [`answer "${ex.answer}" does not use exactly the given words [${ex.words.join(", ")}]`];
    }
    case "fill_blank": {
      const blanks = ex.text.split("___").length - 1;
      return blanks === ex.answer.length ? [] : [`text has ${blanks} blank(s) (___) but answer has ${ex.answer.length} item(s)`];
    }
    default: return [];
  }
}

export function checkContent(data: ContentData): Problem[] {
  const problems: Problem[] = [];
  const add = (file: string, message: string, id?: string) => problems.push({ file, id, message });

  // vocab bank
  const bank = new Map<string, { item: VocabItem; file: string }>();
  for (const { file, items } of data.vocab) {
    for (const item of items) {
      const prev = bank.get(item.id);
      if (prev) add(file, `duplicate vocab id ${item.id} (also in ${prev.file})`, item.id);
      else bank.set(item.id, { item, file });
      for (const t of item.topics) {
        if (!topicSet.has(t)) add(file, `unknown topic "${t}" (see docs/VOCABULARY.md section 3)`, item.id);
      }
    }
  }

  const exerciseIds = new Map<string, string>();
  const introducedIn = new Map<string, string>();
  for (const { file, lesson } of data.lessons) {
    const m = /^day-(\d{3})\.json$/.exec(path.posix.basename(file));
    if (!m) add(file, "lesson file must be named day-XXX.json");
    else if (Number(m[1]) !== lesson.day) add(file, `lesson day ${lesson.day} does not match file name day-${m[1]}.json`);

    const requireVocab = (id: string, where?: string) => {
      if (!bank.has(id)) add(file, `vocab id ${id} is not in the vocab bank`, where);
    };

    for (const id of lesson.vocab) {
      requireVocab(id);
      const prev = introducedIn.get(id);
      if (prev) add(file, `${id} is already introduced as new in ${prev}`);
      else introducedIn.set(id, file);
      const entry = bank.get(id);
      if (entry && !levelAllowed(entry.item.oxford.level, lesson.cefr)) {
        add(file, `${id} is Oxford ${entry.item.oxford.level} but the lesson is ${lesson.cefr}`);
      }
    }

    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        const prev = exerciseIds.get(ex.id);
        if (prev) add(file, `duplicate exercise id ${ex.id} (also in ${prev})`, ex.id);
        else exerciseIds.set(ex.id, file);
        const day = /^d(\d{3})-/.exec(ex.id);
        if (day && Number(day[1]) !== lesson.day) {
          add(file, `exercise id day ${Number(day[1])} does not match lesson day ${lesson.day}`, ex.id);
        }
        for (const v of vocabRefs(ex)) requireVocab(v, ex.id);
        for (const msg of answerProblems(ex)) add(file, msg, ex.id);
      }
    }
  }
  return problems;
}

export function summarize(data: ContentData): Summary {
  const words = new Set(data.vocab.flatMap((v) => v.items.map((i) => i.id)));
  const introduced = new Set(data.lessons.flatMap((l) => l.lesson.vocab).filter((id) => words.has(id)));
  return { lessons: data.lessons.length, words: words.size, introduced: introduced.size, notIntroduced: words.size - introduced.size };
}

export function formatSummary(s: Summary): string {
  const pct = s.words ? Math.round((s.introduced / s.words) * 100) : 0;
  return `lessons: ${s.lessons} | vocab bank: ${s.words} words | introduced: ${s.introduced} (${pct}%) | not yet in any lesson: ${s.notIntroduced}`;
}

export function validateContentDir(root: string): { problems: Problem[]; summary: Summary } {
  const { problems: fileProblems, ...data } = readContent(root);
  return { problems: [...fileProblems, ...checkContent(data)], summary: summarize(data) };
}
