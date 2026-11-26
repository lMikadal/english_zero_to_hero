// Pure helpers shared by the client (player, /practice list) and the server (replay completion), so both sides
// agree on which sections a replay plays. Client-safe: no server imports (client-safe.test.ts).
import { REPLAY_SKILLS, type ReplaySkill } from "@/lib/attempts/contract";
import type { Lesson, Section } from "@/lib/content/schema";

export const REPLAY_SKILL_LABEL_TH: Record<ReplaySkill, string> = {
  pronunciation: "ออกเสียง",
  listening: "ฟัง",
  speaking: "พูด",
  reading: "อ่าน",
  writing: "เขียน",
};

/** `?skill=` from a page: absent = whole lesson (null); one valid skill; anything else (repeated, empty, case, vocabulary) = "invalid". */
export function parseReplaySkill(raw: string | string[] | undefined): ReplaySkill | null | "invalid" {
  if (raw === undefined) return null;
  if (typeof raw !== "string") return "invalid";
  return (REPLAY_SKILLS as readonly string[]).includes(raw) ? (raw as ReplaySkill) : "invalid";
}

/** The skills a lesson has, in lesson order (first appearance), with the total exercises of all sections of that skill. */
export function replaySkills(lesson: Lesson): { skill: ReplaySkill; exercises: number }[] {
  const out: { skill: ReplaySkill; exercises: number }[] = [];
  for (const s of lesson.sections) {
    const found = out.find((o) => o.skill === s.skill);
    if (found) found.exercises += s.exercises.length;
    else out.push({ skill: s.skill, exercises: s.exercises.length });
  }
  return out;
}

/** null = every section; a skill = the sections with that skill, in lesson order. */
export function replaySections(lesson: Lesson, skill: ReplaySkill | null): Section[] {
  return skill === null ? lesson.sections : lesson.sections.filter((s) => s.skill === skill);
}

/** The page that plays a replay: the whole day, or one skill's sections. Neutral (no "use client"), so server and client pages share it. */
export const replayHref = (day: number, skill: ReplaySkill | null): string => (skill === null ? `/day/${day}` : `/day/${day}?skill=${skill}`);
