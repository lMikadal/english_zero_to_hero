// Cross-file content rules (docs/VOCABULARY.md section 6, docs/TESTING.md). Pure: no file IO except validateContentDir.
import path from "node:path";
import { readContent, formatProblem, type ContentData, type Problem } from "./loader";
import { checkContentRules } from "./rules";
import { CEFR_LEVELS, type CefrLevel, type Exercise, type VocabItem } from "./schema";

export { formatProblem };
export type { ContentData, LoadedLesson, LoadedVocab, Problem } from "./loader";

export type Summary = { lessons: number; words: number; introduced: number; notIntroduced: number };

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

const MAX_NEW_WORDS = 12;
const key = (s: string) => s.trim().toLowerCase();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function duplicates(xs: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const x of xs.map(key)) (seen.has(x) ? dup : seen).add(x);
  return [...dup];
}

function choiceProblems(choices: string[], where: string): string[] {
  return duplicates(choices).map((c) => `${where}duplicate choice "${c}" (compared trimmed, case-insensitive)`);
}

function answerProblems(ex: Exercise): string[] {
  switch (ex.type) {
    case "listen_choose":
      return [
        ...(ex.answer < ex.choices.length ? [] : [`answer ${ex.answer} is not an index into choices (0-${ex.choices.length - 1})`]),
        ...choiceProblems(ex.choices, ""),
      ];
    case "read_passage":
      return ex.questions.flatMap((q, i) => [
        ...(q.answer < q.choices.length ? [] : [`questions[${i}].answer ${q.answer} is not an index into choices (0-${q.choices.length - 1})`]),
        ...choiceProblems(q.choices, `questions[${i}]: `),
      ]);
    case "minimal_pair":
      return ex.pairs.flatMap((p, i) => (key(p.a) === key(p.b) ? [`pairs[${i}]: a and b are the same word ("${p.a}")`] : []));
    case "vocab_match":
      return duplicates(ex.pairs.map((p) => p.vocabId)).map((v) => `duplicate vocabId ${v} in pairs`);
    case "arrange_words": {
      const out: string[] = [];
      if (ex.answer !== ex.answer.split(/\s+/).join(" ")) out.push("answer must be single-spaced (one plain space between words)");
      const norm = (xs: string[]) => [...xs].sort().join("\u0000");
      const got = ex.answer.split(/\s+/).filter(Boolean);
      const tiles = ex.words.flatMap((w) => w.split(/\s+/).filter(Boolean));
      if (norm(got) !== norm(tiles)) out.push(`answer "${ex.answer}" does not use exactly the given words [${ex.words.join(", ")}]`);
      // alternatives: same tiles, compared case-insensitively (the tile case follows the answer, e.g. "Is this" vs tile "This")
      const lower = (xs: string[]) => norm(xs.map((x) => x.toLowerCase()));
      for (const alt of ex.accept ?? []) {
        if (alt !== alt.split(/\s+/).join(" ")) out.push(`accept "${alt}" must be single-spaced`);
        else if (lower(alt.split(" ")) !== lower(tiles)) out.push(`accept "${alt}" does not use exactly the given words [${ex.words.join(", ")}]`);
      }
      return out;
    }
    case "fill_blank": {
      const runs = ex.text.match(/_+/g) ?? [];
      const bad = runs.filter((r) => r.length !== 3);
      if (bad.length) return [`a blank is exactly three underscores (___); found "${bad[0]}"`];
      const blanks = (ex.text.match(/(?<!_)___(?!_)/g) ?? []).length;
      return blanks === ex.answer.length ? [] : [`text has ${blanks} blank(s) (___) but answer has ${ex.answer.length} item(s)`];
    }
    default: return [];
  }
}

const expectedPhase = (day: number) => (day <= 60 ? 1 : day <= 150 ? 2 : day <= 270 ? 3 : 4);

function bankFileProblem(file: string, item: VocabItem): string | undefined {
  const m3 = /oxford-3000\/([^/]+)\.json$/.exec(file);
  if (m3) {
    if (item.oxford.list !== "3000") return `list is ${item.oxford.list} but the file is under oxford-3000/`;
    if (item.oxford.level.toLowerCase() !== m3[1]) return `level ${item.oxford.level} does not match file name ${m3[1]}.json`;
  } else if (/oxford-5000\//.test(file) && item.oxford.list !== "5000") {
    return `list is ${item.oxford.list} but the file is under oxford-5000/`;
  }
  return undefined;
}

export function checkContent(data: ContentData): Problem[] {
  const problems: Problem[] = [];
  const add = (file: string, message: string, id?: string) => problems.push({ file, id, message });
  const failed = new Set(data.failedVocabIds ?? []);

  // vocab bank
  const bank = new Map<string, { item: VocabItem; file: string }>();
  const byWordPos = new Map<string, string>();
  for (const { file, items } of data.vocab) {
    for (const item of items) {
      const prev = bank.get(item.id);
      if (prev) add(file, `duplicate vocab id ${item.id} (also in ${prev.file})`, item.id);
      else bank.set(item.id, { item, file });
      const wp = `${key(item.word)}\u0000${key(item.pos)}`;
      const other = byWordPos.get(wp);
      if (other && other !== item.id) add(file, `same word and pos as ${other} ("${item.word}", ${item.pos}); each word+pos may appear once in the bank`, item.id);
      else byWordPos.set(wp, item.id);
      const base = `v-${slug(item.word)}`;
      if (item.id !== base && item.id !== `${base}-${slug(item.pos)}`) {
        add(file, `id does not match word "${item.word}" (expected ${base} or ${base}-${slug(item.pos)})`, item.id);
      }
      const fileProblem = bankFileProblem(file, item);
      if (fileProblem) add(file, fileProblem, item.id);
      for (const t of duplicates(item.topics)) add(file, `duplicate topic "${t}"`, item.id);
    }
  }

  const exerciseIds = new Map<string, string>();
  const introducedIn = new Map<string, string>();
  const lessons = [...data.lessons].sort((a, b) => a.lesson.day - b.lesson.day);
  for (const { file, lesson } of lessons) {
    let dayOk = true;
    const m = /^day-(\d{3})\.json$/.exec(path.posix.basename(file));
    if (!m) add(file, "lesson file must be named day-XXX.json");
    else if (Number(m[1]) !== lesson.day) {
      add(file, `lesson day ${lesson.day} does not match file name day-${m[1]}.json`);
      dayOk = false;
    }
    if (lesson.week !== Math.ceil(lesson.day / 7)) add(file, `week ${lesson.week} is wrong for day ${lesson.day} (expected ${Math.ceil(lesson.day / 7)})`);
    if (lesson.phase !== expectedPhase(lesson.day)) add(file, `phase ${lesson.phase} is wrong for day ${lesson.day} (expected ${expectedPhase(lesson.day)})`);
    if (lesson.type === "checkpoint" && lesson.day % 30 !== 0) add(file, `type "checkpoint" is only allowed on days divisible by 30 (day ${lesson.day})`);
    if (lesson.vocab.length > 0 && lesson.type !== "lesson") add(file, `new vocab is allowed only on "lesson" days, but type is "${lesson.type}"`);
    if (lesson.vocab.length > MAX_NEW_WORDS) add(file, `${lesson.vocab.length} new words; at most ${MAX_NEW_WORDS} per lesson`);

    const requireVocab = (id: string, where?: string, path = "") => {
      if (!bank.has(id)) {
        if (!failed.has(id)) add(file, `${path}${id} is not in the vocab bank`, where);
      } else if (!introducedIn.has(id)) {
        add(file, `${path}${id} is not introduced (listed in vocab) in this lesson or an earlier day`, where);
      }
    };

    const here = new Set<string>();
    lesson.vocab.forEach((id, i) => {
      const at = `vocab[${i}]: `;
      if (here.has(id)) {
        add(file, `${at}${id} listed twice in vocab`);
        return;
      }
      here.add(id);
      const prev = introducedIn.get(id);
      if (prev) add(file, `${at}${id} is already introduced as new in ${prev}`);
      else introducedIn.set(id, file);
      const entry = bank.get(id);
      if (!entry && !failed.has(id)) add(file, `${at}${id} is not in the vocab bank`);
      if (entry && !levelAllowed(entry.item.oxford.level, lesson.cefr)) {
        add(file, `${at}${id} is Oxford ${entry.item.oxford.level} but the lesson is ${lesson.cefr}`);
      }
    });

    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        const prev = exerciseIds.get(ex.id);
        if (prev) add(file, `duplicate exercise id ${ex.id} (also in ${prev})`, ex.id);
        else exerciseIds.set(ex.id, file);
        const day = /^d(\d{3})-/.exec(ex.id);
        if (dayOk && day && Number(day[1]) !== lesson.day) {
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
  return { problems: [...fileProblems, ...checkContent(data), ...checkContentRules(data)], summary: summarize(data) };
}
