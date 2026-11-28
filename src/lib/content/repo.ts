// Server-only content access for route handlers and server components (reads files from content/).
// Do not import this from client components; client-safe code gets content through props.
// Deliberately does not use loadVocabBank/loadAllLessons: those re-validate every content file and throw if
// any one is bad. Here a bad lesson only affects that lesson, and a bad vocab entry is skipped.
import fs from "node:fs";
import path from "node:path";
import type { VocabLookup } from "@/components/exercises/types";
import { loadLesson } from "./loader";
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
  const file = path.join(root, "lessons", `day-${String(day).padStart(3, "0")}.json`);
  const lesson = fs.existsSync(file) ? loadLesson(day, root) : null; // an invalid file throws; a missing one is null
  if (cached()) lessons.set(key, lesson);
  return lesson;
}

function readVocabIndex(root: string): Map<string, VocabItem> {
  const index = new Map<string, VocabItem>();
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
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

function vocabIndex(root: string): Map<string, VocabItem> {
  let index = cached() ? vocabIndexes.get(root) : undefined;
  if (!index) {
    index = readVocabIndex(root);
    if (cached()) vocabIndexes.set(root, index);
  }
  return index;
}

/** word, Thai meaning and IPA for the given vocab ids. Unknown ids are left out. */
export function getVocabLookup(ids: readonly string[], root = defaultRoot()): VocabLookup {
  const index = vocabIndex(root);
  const out: VocabLookup = {};
  for (const id of ids) {
    const v = index.get(id);
    if (v) out[id] = { word: v.word, th: v.th, ipa: { us: v.ipa.us, uk: v.ipa.uk } };
  }
  return out;
}

/** The whole vocabulary entry (word, IPA for both accents, Thai, examples), or null when the id is not in the bank. */
export function getVocabEntry(id: string, root = defaultRoot()): VocabItem | null {
  return vocabIndex(root).get(id) ?? null;
}

/**
 * A lookup bound to ONE vocabulary index: build it once, then ask for as many entries as you like. getVocabEntry builds
 * (outside production) a whole index per call, which is fine for one id and ruinous for a loop over every taught word.
 */
export function vocabReader(root = defaultRoot()): (id: string) => VocabItem | null {
  const index = vocabIndex(root);
  return (id) => index.get(id) ?? null;
}

const taught = new Map<string, ReadonlyMap<string, string>>();

/**
 * Every word taught on or before `day` (vocab id -> word): what deriveTags needs, so review days that teach
 * nothing still get vocab tags. A lesson file that is broken is skipped (its words are simply not tagged)
 * rather than failing every attempt; `content:validate` is where broken files are reported.
 */
export function getTaughtWords(day: number, root = defaultRoot()): ReadonlyMap<string, string> {
  const last = Math.min(Math.max(Math.trunc(day), 0), 365);
  const key = `${root}\0${last}`;
  if (cached() && taught.has(key)) return taught.get(key)!;
  const index = vocabIndex(root);
  const out = new Map<string, string>();
  for (let d = 1; d <= last; d++) {
    let lesson: Lesson | null = null;
    try {
      lesson = getLesson(d, root);
    } catch {
      continue;
    }
    for (const id of lesson?.vocab ?? []) {
      const v = index.get(id);
      if (v) out.set(id, v.word);
    }
  }
  if (cached()) taught.set(key, out);
  return out;
}
