// Reads and schema-validates content files. Pure file IO + Zod; cross-file rules live in validate.ts.
import fs from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";
import { checkpointSchema, isCheckpointDay, type Checkpoint } from "./checkpoint-schema";
import { lessonSchema, vocabItemSchema, type Lesson, type VocabItem } from "./schema";

/** `rule` names a content rule family (src/lib/content/rules/); the CLI groups problems by it. */
export type Problem = { file: string; id?: string; message: string; rule?: string;
  /** "warning" is printed but does not fail the validation; the default is an error. */
  severity?: "warning" };
export type LoadedLesson = { file: string; lesson: Lesson };
export type LoadedVocab = { file: string; items: VocabItem[] };
export type LoadedCheckpoint = { file: string; checkpoint: Checkpoint };
/** `checkpoints` is optional so content built without any (tests, fixtures) still compiles. */
export type ContentData = { lessons: LoadedLesson[]; vocab: LoadedVocab[]; checkpoints?: LoadedCheckpoint[]; failedVocabIds?: string[] };

export class ContentError extends Error {
  constructor(readonly problems: Problem[]) {
    super(problems.map(formatProblem).join("\n"));
    this.name = "ContentError";
  }
}

export function formatProblem(p: Problem): string {
  return `${p.file}${p.id ? ` [${p.id}]` : ""}: ${p.message}`;
}

/** `sections[0].exercises[2].answer`, or `[3].topics` for a top-level array. */
export function formatPath(segments: readonly PropertyKey[]): string {
  return segments.reduce<string>((acc, s) => {
    if (typeof s === "number") return `${acc}[${s}]`;
    return acc ? `${acc}.${String(s)}` : String(s);
  }, "");
}

/** The nearest `id` on the way down `path`, so a schema error can name its exercise or word. */
function idAlong(data: unknown, segments: readonly PropertyKey[]): string | undefined {
  let found: string | undefined;
  let cur = data;
  const take = () => {
    const id = (cur as { id?: unknown } | null)?.id;
    if (cur && typeof cur === "object" && typeof id === "string") found = id;
  };
  for (const s of segments) {
    take();
    if (cur === null || typeof cur !== "object") break;
    cur = (cur as Record<PropertyKey, unknown>)[s];
  }
  take();
  return found;
}

function readJson(abs: string, display: string): { raw?: unknown; problem?: Problem } {
  try {
    return { raw: JSON.parse(fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "")) };
  } catch (e) {
    return { problem: { file: display, message: `cannot read as JSON: ${(e as Error).message}` } };
  }
}

function issueProblems(display: string, raw: unknown, issues: readonly { path: readonly PropertyKey[]; message: string }[], prefix: PropertyKey[] = []): Problem[] {
  return issues.map((i) => {
    const full = [...prefix, ...i.path];
    return { file: display, id: idAlong(raw, full), message: `${formatPath(full) || "(root)"}: ${i.message}` };
  });
}

function parseFile<T>(abs: string, display: string, schema: ZodType<T>): { data?: T; problems: Problem[] } {
  const { raw, problem } = readJson(abs, display);
  if (problem) return { problems: [problem] };
  const r = schema.safeParse(raw);
  if (r.success) return { data: r.data, problems: [] };
  return { problems: issueProblems(display, raw, r.error.issues) };
}

/** Vocab files are validated entry by entry so one bad word does not drop the rest. */
function parseVocabFile(abs: string, display: string): { items: VocabItem[]; failedIds: string[]; problems: Problem[] } {
  const { raw, problem } = readJson(abs, display);
  if (problem) return { items: [], failedIds: [], problems: [problem] };
  if (!Array.isArray(raw)) return { items: [], failedIds: [], problems: [{ file: display, message: "(root): vocab file must be a JSON array of words" }] };
  const items: VocabItem[] = [];
  const failedIds: string[] = [];
  const problems: Problem[] = [];
  raw.forEach((entry, i) => {
    const r = vocabItemSchema.safeParse(entry);
    if (r.success) return items.push(r.data);
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id === "string") failedIds.push(id);
    problems.push(...issueProblems(display, raw, r.error.issues, [i]));
  });
  return { items, failedIds, problems };
}

const displayName = (root: string, abs: string) =>
  path.posix.join(path.basename(root), path.relative(root, abs).split(path.sep).join("/"));

const isDir = (p: string) => fs.existsSync(p) && fs.statSync(p).isDirectory();

/** Loads every lesson and vocab file under `root`, collecting problems instead of throwing. */
export function readContent(root: string): ContentData & { problems: Problem[] } {
  const problems: Problem[] = [];
  const lessons: LoadedLesson[] = [];
  const vocab: LoadedVocab[] = [];
  const checkpoints: LoadedCheckpoint[] = [];
  const failedVocabIds: string[] = [];
  const dirs = { lessons: path.join(root, "lessons"), vocab: path.join(root, "vocab") };
  if (!isDir(root)) {
    return { lessons, vocab, problems: [{ file: path.basename(root), message: "content directory not found" }] };
  }
  for (const dir of Object.values(dirs)) {
    if (!isDir(dir)) problems.push({ file: displayName(root, dir), message: "directory not found" });
  }

  if (isDir(dirs.lessons)) {
    const entries = fs.readdirSync(/*turbopackIgnore: true*/ dirs.lessons, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const abs = path.join(dirs.lessons, e.name);
      const display = displayName(root, abs);
      if (!e.isFile() || !/^day-\d{3}\.json$/.test(e.name)) {
        problems.push({ file: display, message: "unexpected entry in lessons/ (only regular files named day-XXX.json are allowed)" });
        continue;
      }
      const r = parseFile(abs, display, lessonSchema);
      problems.push(...r.problems);
      if (r.data) lessons.push({ file: display, lesson: r.data });
    }
    if (entries.length === 0) problems.push({ file: displayName(root, dirs.lessons), message: "no lesson files found" });
  }

  if (isDir(dirs.vocab)) {
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else if (!e.isFile() || !e.name.endsWith(".json")) {
          problems.push({ file: displayName(root, abs), message: "unexpected file in vocab/ (only .json files are allowed)" });
        } else {
          const r = parseVocabFile(abs, displayName(root, abs));
          problems.push(...r.problems);
          failedVocabIds.push(...r.failedIds);
          vocab.push({ file: displayName(root, abs), items: r.items });
        }
      }
    };
    walk(dirs.vocab);
    if (!vocab.some((v) => v.items.length > 0) && failedVocabIds.length === 0) {
      problems.push({ file: displayName(root, dirs.vocab), message: "no vocab words found" });
    }
  }

  // checkpoints/ is optional: no folder, or an empty one, is fine (no monthly test yet)
  const cpDir = path.join(root, "checkpoints");
  if (isDir(cpDir)) {
    for (const e of fs.readdirSync(/*turbopackIgnore: true*/ cpDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(cpDir, e.name);
      const display = displayName(root, abs);
      if (!e.isFile() || !/^checkpoint-\d{3}\.json$/.test(e.name)) {
        problems.push({ file: display, message: "unexpected entry in checkpoints/ (only regular files named checkpoint-XXX.json are allowed)" });
        continue;
      }
      const r = parseFile(abs, display, checkpointSchema);
      problems.push(...r.problems);
      if (r.data) checkpoints.push({ file: display, checkpoint: r.data });
    }
  }
  return { lessons, vocab, checkpoints, failedVocabIds, problems };
}

const defaultRoot = () => path.resolve(process.cwd(), "content");

export function loadLesson(day: number, root = defaultRoot()): Lesson {
  const abs = path.join(root, "lessons", `day-${String(day).padStart(3, "0")}.json`);
  const display = displayName(root, abs);
  if (!fs.existsSync(abs)) throw new ContentError([{ file: display, message: "file not found" }]);
  const r = parseFile(abs, display, lessonSchema);
  if (!r.data) throw new ContentError(r.problems);
  return r.data;
}

/** The checkpoint taken after `afterDay`; throws ContentError when the file is missing or invalid. */
export function loadCheckpoint(afterDay: number, root = defaultRoot()): Checkpoint {
  if (!isCheckpointDay(afterDay)) throw new ContentError([{ file: "checkpoints", message: `${afterDay} is not a checkpoint day (30, 60, ... 360)` }]);
  const abs = path.join(root, "checkpoints", `checkpoint-${String(afterDay).padStart(3, "0")}.json`);
  const display = displayName(root, abs);
  if (!fs.existsSync(abs)) throw new ContentError([{ file: display, message: "file not found" }]);
  const r = parseFile(abs, display, checkpointSchema);
  if (!r.data) throw new ContentError(r.problems);
  if (r.data.afterDay !== afterDay) throw new ContentError([{ file: display, message: `the file says afterDay ${r.data.afterDay} but checkpoint ${afterDay} was requested (rename the file or fix afterDay)` }]);
  return r.data;
}

function throwIfProblems(problems: Problem[]) {
  if (problems.length) throw new ContentError(problems);
}

export function loadAllLessons(root = defaultRoot()): Lesson[] {
  const r = readContent(root);
  throwIfProblems(r.problems);
  return r.lessons.map((l) => l.lesson).sort((a, b) => a.day - b.day);
}

export function loadVocabBank(root = defaultRoot()): VocabItem[] {
  const r = readContent(root);
  throwIfProblems(r.problems);
  return r.vocab.flatMap((v) => v.items);
}
