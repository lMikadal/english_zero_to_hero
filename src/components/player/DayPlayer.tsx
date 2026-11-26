"use client";
// Client boundary for the day page: the sink is created here because functions cannot cross from a server component.
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { VocabLookup } from "@/components/exercises/types";
import type { ReplaySkill } from "@/lib/attempts/contract";
import type { Lesson } from "@/lib/content/schema";
import { getSyncSink } from "@/lib/offline/http-sink";
import { LessonPlayer, type PlayerMode } from "./LessonPlayer";
import { UnsavedGuard } from "./UnsavedNote";

export function DayPlayer({
  lesson, vocab, mode = "lesson", skill = null,
}: { lesson: Lesson; vocab: VocabLookup; mode?: PlayerMode; skill?: ReplaySkill | null }) {
  // "เล่นอีกครั้ง" remounts the player (new session). The mode is deliberately NOT in the key: see LessonPlayer's `mode`.
  const [round, setRound] = useState(0);
  const replay = useCallback(() => setRound((r) => r + 1), []);
  // The one app-wide queue, created on first use in the browser (the lazy initialiser runs once per mount).
  const [sink] = useState(getSyncSink);
  const router = useRouter();
  // The day is finished: pages the browser may serve from its cache (home, day pages) are stale now.
  const refresh = useCallback(() => router.refresh(), [router]);
  return (
    <>
      <UnsavedGuard />
      <LessonPlayer
        key={`${lesson.day}-${skill ?? "all"}-${round}`} lesson={lesson} mode={mode} skill={skill} vocab={vocab} sink={sink} onDone={refresh} onReplay={replay}
      />
    </>
  );
}
