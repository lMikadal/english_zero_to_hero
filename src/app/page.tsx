import Link from "next/link";
import { getDb } from "@/db/client";
import { getLearnerHome, type LearnerHome } from "@/db/queries/home";
import { UnsavedNote } from "@/components/player/UnsavedNote";
import { DbErrorScreen } from "@/components/ui/DbErrorScreen";
import { getCurrentUserId } from "@/lib/server/current-user";
import { COURSE_DAYS } from "@/lib/progress/config";

// Today's day and streak depend on the learner and the clock: never cache.
export const dynamic = "force-dynamic";

export default async function Home() {
  let home: LearnerHome;
  try {
    home = await getLearnerHome(getDb(), await getCurrentUserId());
  } catch (e) {
    console.error("Cannot read the learner's home data:", e);
    return <DbErrorScreen retryHref="/" />;
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <Link
        href="/settings"
        aria-label="ตั้งค่า"
        className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full text-muted"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      </Link>
      <h1 className="text-3xl font-bold">English Zero to Hero</h1>
      <p className="text-lg text-muted">ฝึกภาษาอังกฤษทุกวัน จากศูนย์สู่มือโปร</p>
      <p className="text-2xl font-semibold">วันที่ {home.currentDay} / {COURSE_DAYS}</p>
      <p className="text-lg">สตรีค {home.streak.current} วัน</p>
      {home.activeToday && <p className="text-good-fg">วันนี้เรียนแล้ว ✓</p>}
      {home.courseComplete ? (
        <p className="w-full rounded-xl bg-good-soft p-4 text-lg font-semibold text-good-fg">
          เรียนครบ {COURSE_DAYS} วันแล้ว ยินดีด้วย!
        </p>
      ) : (
        <Link
          href={`/day/${home.currentDay}`}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-lg font-semibold text-on-accent"
        >
          เริ่มบทเรียนวันที่ {home.currentDay}
        </Link>
      )}
      <UnsavedNote />
    </main>
  );
}
