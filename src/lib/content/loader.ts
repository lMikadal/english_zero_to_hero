// Reads and schema-validates content files. Pure file IO + Zod; cross-file rules live in validate.ts.
import fs from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";
import { lessonSchema, vocabFileSchema, type Lesson, type VocabItem } from "./schema";

export type Problem = { file: string; id?: string; message: string };
export type LoadedLesson = { file: string; lesson: Lesson };
export type LoadedVocab = { file: string; items: VocabItem[] };
export type ContentData = { lessons: LoadedLesson[]; vocab: LoadedVocab[] };

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

function parseFile<T>(abs: string, display: string, schema: ZodType<T>): { data?: T; problems: Problem[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    return { problems: [{ file: display, message: `cannot read as JSON: ${(e as Error).message}` }] };
  }
  const r = schema.safeParse(raw);
  if (r.success) return { data: r.data, problems: [] };
  return {
    problems: r.error.issues.map((i) => ({
      file: display,
      id: idAlong(raw, i.path),
      message: `${formatPath(i.path) || "(root)"}: ${i.message}`,
    })),
  };
}

const displayName = (root: string, abs: string) =>
  path.posix.join(path.basename(root), path.relative(root, abs).split(path.sep).join("/"));

function jsonFiles(dir: string, recursive: boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".json"))
    .map((d) => path.join(d.parentPath, d.name))
    .sort();
}

/** Loads every lesson and vocab file under `root`, collecting problems instead of throwing. */
export function readContent(root: string): ContentData & { problems: Problem[] } {
  const problems: Problem[] = [];
  const lessons: LoadedLesson[] = [];
  const vocab: LoadedVocab[] = [];
  for (const abs of jsonFiles(path.join(root, "lessons"), false)) {
    const r = parseFile(abs, displayName(root, abs), lessonSchema);
    problems.push(...r.problems);
    if (r.data) lessons.push({ file: displayName(root, abs), lesson: r.data });
  }
  for (const abs of jsonFiles(path.join(root, "vocab"), true)) {
    const r = parseFile(abs, displayName(root, abs), vocabFileSchema);
    problems.push(...r.problems);
    if (r.data) vocab.push({ file: displayName(root, abs), items: r.data });
  }
  return { lessons, vocab, problems };
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
