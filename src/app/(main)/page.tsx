import Link from "next/link";
import { getDb } from "@/db/client";
import { getLearnerHome, type LearnerHome } from "@/db/queries/home";
import { HomeCheckpointCard, HomeCheckpointLink } from "@/components/checkpoint/CheckpointEntry";
import { UnsavedNote } from "@/components/player/UnsavedNote";
import { HomeReviewLink, type ReviewNumbers } from "@/components/review/ReviewEntry";
import { DbErrorScreen } from "@/components/ui/DbErrorScreen";
import { getCurrentUserId } from "@/lib/server/current-user";
import { getLesson } from "@/lib/content/repo";
import type { Lesson } from "@/lib/content/schema";
import { COURSE_DAYS } from "@/lib/progress/config";
import { getReviewSummary } from "@/lib/srs/cards";

// Today's day and streak depend on the learner and the clock: never cache.
export const dynamic = "force-dynamic";

export default async function Home() {
  let home: LearnerHome;
  let review: ReviewNumbers = null;
  try {
    const userId = await getCurrentUserId();
    home = await getLearnerHome(getDb(), userId);
    try {
      // The server's clock decides "today" (in the learner's zone, inside getReviewSummary); the same definition as /review.
      review = await getReviewSummary(getDb(), userId, new Date());
    } catch (e) {
      console.error("Cannot read the review summary:", e); // the tile and the link are left out, nothing is invented
    }
  } catch (e) {
    console.error("Cannot read the learner's home data:", e);
    return <DbErrorScreen retryHref="/" underNav />;
  }

  // The title comes from content/. A missing or invalid lesson file only hides the title; the start button still works.
  let lesson: Lesson | null = null;
  if (!home.courseComplete) {
    try {
      lesson = getLesson(home.currentDay);
    } catch (e) {
      console.error(`Cannot load lesson for day ${home.currentDay}:`, e);
    }
  }
  const finished = home.courseComplete ? COURSE_DAYS : home.currentDay - 1;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-14">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight">English Zero to Hero</h1>
        <p className="text-sm text-muted">ฝึกภาษาอังกฤษทุกวัน จากศูนย์สู่มือโปร</p>
      </header>
      {home.courseComplete ? (
        <p className="rounded-2xl border border-good bg-good-soft p-4 text-lg font-semibold text-good-fg">
          เรียนครบ {COURSE_DAYS} วันแล้ว ยินดีด้วย!
        </p>
      ) : home.blockingCheckpoint !== null ? (
        // a monthly checkpoint holds day A+1 back (any score unlocks it): it is today's one primary action
        <HomeCheckpointCard afterDay={home.blockingCheckpoint} />
      ) : (
        <section aria-label="บทเรียนวันนี้" className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted">บทเรียนวันนี้</p>
              <h2 className="text-3xl font-bold">
                วันที่ {home.currentDay} <span className="text-base font-normal text-muted">/ {COURSE_DAYS}</span>
              </h2>
            </div>
            {lesson && (
              <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-fg">
                เฟส {lesson.phase} · {lesson.cefr}
              </span>
            )}
          </div>
          {lesson && (
            <div>
              <p lang="en" className="text-base font-semibold">{lesson.title.en}</p>
              <p className="text-base text-muted">{lesson.title.th}</p>
            </div>
          )}
          <div
            role="progressbar"
            aria-label="เรียนแล้ว"
            aria-valuemin={0}
            aria-valuemax={COURSE_DAYS}
            aria-valuenow={finished}
            aria-valuetext={`${finished} จาก ${COURSE_DAYS} วัน`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
          >
            <div className="h-full min-w-1.5 rounded-full bg-accent" style={{ width: `${(finished / COURSE_DAYS) * 100}%` }} />
          </div>
          <Link
            href={`/day/${home.currentDay}`}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-lg font-semibold text-on-accent"
          >
            เริ่มบทเรียนวันที่ {home.currentDay}
          </Link>
        </section>
      )}
      {home.blockingCheckpoint === null && <HomeCheckpointLink note={home.checkpointNote} />}
      <HomeReviewLink summary={review} />
      <dl className={`grid gap-3 ${review ? "grid-cols-3" : "grid-cols-2"}`}>
        {[
          { label: "สตรีคต่อเนื่อง", value: `${home.streak.current} วัน` },
          { label: "สตรีคนานที่สุด", value: `${home.streak.longest} วัน` },
          ...(review ? [{ label: "คำที่เรียนแล้ว", value: String(review.withCard) }] : []),
        ].map((s) => (
          <div key={s.label} className="flex flex-col-reverse gap-1 rounded-2xl border border-line bg-card p-3">
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="m-0 text-lg font-bold">{s.value}</dd>
          </div>
        ))}
      </dl>
      {home.activeToday && (
        <p className="flex items-center gap-2 rounded-xl border border-good bg-good-soft px-3.5 py-3 text-sm font-medium text-good-fg">
          <span aria-hidden="true">✓</span>
          {/* the card above says the next lesson is locked: keep the reward, point it at the checkpoint */}
          {home.blockingCheckpoint !== null ? "วันนี้เรียนแล้ว ทำแบบทดสอบประจำเดือนต่อได้เลย" : "วันนี้เรียนแล้ว เรียนบทถัดไปต่อได้เลย"}
        </p>
      )}
      <UnsavedNote />
    </main>
  );
}
