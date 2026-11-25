// Server-only content access for route handlers and server components (reads files from content/).
// Do not import this from client components; client-safe code gets content through props.
// Deliberately does not use loadVocabBank/loadAllLessons: those re-validate every content file and throw if
// any one is bad. Here a bad lesson only affects that lesson, and a bad vocab entry is skipped.
import fs from "node:fs";
import path from "node:path";
import type { VocabLookup } from "@/components/exercises/types";
import { ContentError, loadLesson } from "./loader";
import { vocabItemSchema, type Lesson, type VocabItem } from "./schema";

const defaultRoot = () => path.resolve(process.cwd(), "content");
const cached = () => process.env.NODE_ENV === "production";

const lessons = new Map<string, Lesson | null>();
const vocabIndexes = new Map<string, Map<string, VocabItem>>();

/** The lesson for `day`, or null when the day is out of range or has no file. An invalid file throws. */
export function getLesson(day: number, root = defaultRoot()): Lesson | null {
  if (!Number.isInteger(day) || day < 1 || day > 365) return null;
  const key = `${root}\0${day}`;
  if (cached() && lessons.has(key)) return lessons.get(key)!;
  let lesson: Lesson | null;
  try {
    lesson = loadLesson(day, root);
  } catch (e) {
    const missing = e instanceof ContentError && e.problems.length === 1 && e.problems[0].message === "file not found";
    if (!missing) throw e;
    lesson = null;
  }
  if (cached()) lessons.set(key, lesson);
  return lesson;
}

function readVocabIndex(root: string): Map<string, VocabItem> {
  const index = new Map<string, VocabItem>();
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && e.name.endsWith(".json")) {
        let raw: unknown;
        try {
          raw = JSON.parse(fs.readFileSync(abs, "utf8").replace(/^﻿/, ""));
        } catch {
          continue;
        }
        if (!Array.isArray(raw)) continue;
        for (const entry of raw) {
          const r = vocabItemSchema.safeParse(entry);
          if (r.success) index.set(r.data.id, r.data);
        }
      }
    }
  };
  walk(path.join(root, "vocab"));
  return index;
}

/** word, Thai meaning and IPA for the given vocab ids. Unknown ids are left out. */
export function getVocabLookup(ids: readonly string[], root = defaultRoot()): VocabLookup {
  let index = cached() ? vocabIndexes.get(root) : undefined;
  if (!index) {
    index = readVocabIndex(root);
    if (cached()) vocabIndexes.set(root, index);
  }
  const out: VocabLookup = {};
  for (const id of ids) {
    const v = index.get(id);
    if (v) out[id] = { word: v.word, th: v.th, ipa: { us: v.ipa.us, uk: v.ipa.uk } };
  }
  return out;
}
