import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckpointApp } from "@/components/checkpoint/CheckpointApp";
import { practisedKey, type ResultDisplay } from "@/components/checkpoint/view";
import { buttonClass } from "@/components/ui/button-styles";
import { DbErrorScreen } from "@/components/ui/DbErrorScreen";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { getDb } from "@/db/client";
import { checkpointSavedAts, findOpenSitting, listCheckpointResults, practisedSince, type StoredCheckpointResult } from "@/db/queries/checkpoints";
import { getStreak } from "@/db/queries/progress";
import type { ReplaySkill } from "@/lib/attempts/contract";
import { sittingSavedToday } from "@/lib/checkpoints/retake";
import { isCheckpointPass, weakSkills } from "@/lib/checkpoints/score";
import { isCheckpointDay, type Checkpoint } from "@/lib/content/checkpoint-schema";
import { getCheckpoint, getLesson, getVocabLookup } from "@/lib/content/repo";
import { resolveTimeZone } from "@/lib/progress/dates";
import { getCurrentUserId } from "@/lib/server/current-user";
import { getDayStatus, getLearnerProfile } from "../../access";

// What a learner may start depends on who they are and on the time: never cache.
export const dynamic = "force-dynamic";

const TEXT = "text-sm leading-relaxed text-muted";

/** The exercises of the lesson of `day` that belong to `skill`; none when the lesson cannot be loaded. */
function lessonExerciseIds(day: number, skill: ReplaySkill): string[] {
  try {
    return (getLesson(day)?.sections ?? []).filter((s) => s.skill === skill).flatMap((s) => s.exercises.map((e) => e.id));
  } catch (e) {
    console.error(`Cannot load lesson ${day} for the replay ticks:`, e);
    return [];
  }
}

/** "<day>:<skill>" of every replay link of the result that has been played after the sitting finished (plan 3.6 item 38). */
async function practisedLinks(userId: string, checkpoint: Checkpoint, latest: StoredCheckpointResult): Promise<string[]> {
  const links = weakSkills(latest.skills).flatMap((s) =>
    (checkpoint.sections.find((c) => c.skill === s.skill)?.reviewDays ?? []).map((day) => ({ day, skill: s.skill, ids: lessonExerciseIds(day, s.skill) })),
  );
  const all = [...new Set(links.flatMap((l) => l.ids))];
  if (all.length === 0) return [];
  const played = await practisedSince(getDb(), userId, all, latest.completedAt);
  return links.filter((l) => l.ids.some((id) => played.has(id))).map((l) => practisedKey(l.day, l.skill));
}

export default async function CheckpointPage({ params }: { params: Promise<{ n: string }> }) {
  const { n: raw } = await params;
  // Canonical form only: "/checkpoint/030" and "/checkpoint/45" are not checkpoint pages.
  if (!/^[1-9]\d{1,2}$/.test(raw) || !isCheckpointDay(Number(raw))) notFound();
  const afterDay = Number(raw);
  const retryHref = `/checkpoint/${afterDay}`;

  const now = new Date(); // the server's clock decides "today" for the retake rule
  let status: string;
  let results: StoredCheckpointResult[];
  let savedAts: { afterDay: number; savedAt: Date }[];
  let timezone: string;
  let userId: string;
  try {
    userId = await getCurrentUserId();
    status = await getDayStatus(afterDay);
    results = await listCheckpointResults(getDb(), userId, afterDay);
    savedAts = await checkpointSavedAts(getDb(), userId, afterDay);
    timezone = (await getLearnerProfile()).timezone;
  } catch (e) {
    console.error(`Cannot read the state of checkpoint ${afterDay}:`, e);
    return <DbErrorScreen retryHref={retryHref} />;
  }

  let checkpoint: Checkpoint | null = null;
  try {
    checkpoint = getCheckpoint(afterDay);
  } catch (e) {
    console.error(`Cannot load checkpoint ${afterDay}:`, e); // an invalid content file must not take the page down
  }
  if (!checkpoint) {
    return (
      <StatusScreen title="ยังไม่มีแบบทดสอบนี้" actions={<Link href="/" className={buttonClass("primary")}>กลับหน้าแรก</Link>}>
        <p className={TEXT}>แบบทดสอบหลังบทเรียนวันที่ {afterDay} ยังเขียนไม่เสร็จ กลับมาใหม่เร็วๆ นี้</p>
      </StatusScreen>
    );
  }
  if (status !== "done") {
    return (
      <StatusScreen icon="🔒" title="ยังไม่ปลดล็อก" actions={<Link href="/today" className={buttonClass("primary")}>ไปเรียนต่อ</Link>}>
        <p className={TEXT}>เรียนถึงวันที่ {afterDay} ให้จบก่อน แล้วแบบทดสอบนี้จะเปิดให้</p>
      </StatusScreen>
    );
  }

  const latest = results.at(-1) ?? null;
  const zone = resolveTimeZone(timezone);
  // The server's own rule (the same function POST /api/checkpoints/complete uses): by when the sitting was SAVED, not the client's completedAt.
  const completedToday = latest !== null && sittingSavedToday(savedAts.map((r) => r.savedAt), now, zone);
  let nextLesson = false;
  try {
    nextLesson = getLesson(afterDay + 1) !== null;
  } catch {
    nextLesson = false;
  }

  let open: Awaited<ReturnType<typeof findOpenSitting>> = null;
  let streak: { current: number; longest: number } | null = null;
  let practised: string[] = [];
  try {
    open = completedToday ? null : await findOpenSitting(getDb(), userId, afterDay, now);
    if (latest) {
      practised = await practisedLinks(userId, checkpoint, latest);
      if (completedToday) streak = await getStreak(getDb(), userId);
    }
  } catch (e) {
    console.error(`Cannot read the sitting of checkpoint ${afterDay}:`, e);
    return <DbErrorScreen retryHref={retryHref} />;
  }

  const display: ResultDisplay | null = latest
    ? {
        result: {
          sessionId: latest.id, afterDay, score: latest.score, passed: isCheckpointPass(latest.score), skills: latest.skills,
          completedAt: latest.completedAt.toISOString(), sitting: results.length, best: Math.max(...results.map((r) => r.score)),
        },
        streak,
        nextDay: nextLesson ? afterDay + 1 : null,
      }
    : null;

  return (
    <CheckpointApp
      checkpoint={checkpoint}
      vocab={getVocabLookup(checkpoint.sections.flatMap((s) => s.exercises).flatMap((e) => (e.type === "vocab_match" ? e.pairs.map((p) => p.vocabId) : [])))}
      resume={open}
      last={latest ? { score: latest.score, passed: isCheckpointPass(latest.score) } : null}
      completedToday={completedToday}
      latest={display}
      practised={practised}
    />
  );
}
