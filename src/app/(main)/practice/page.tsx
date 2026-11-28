import Link from "next/link";
import { PracticeCheckpointSection } from "@/components/checkpoint/CheckpointEntry";
import { getDb } from "@/db/client";
import { getCheckpointOverview, type CheckpointOverviewEntry } from "@/db/queries/checkpoints";
import { listDoneDays } from "@/db/queries/practice";
import { buttonClass } from "@/components/ui/button-styles";
import { DbErrorScreen } from "@/components/ui/DbErrorScreen";
import { getCheckpoint, getLesson } from "@/lib/content/repo";
import type { Lesson } from "@/lib/content/schema";
import { REPLAY_SKILL_LABEL_TH, replayHref, replaySkills } from "@/lib/practice/replay";
import { PracticeReviewCard, type ReviewNumbers } from "@/components/review/ReviewEntry";
import { getCurrentUserId } from "@/lib/server/current-user";
import { getReviewSummary } from "@/lib/srs/cards";

// Which days are finished depends on the learner: never cache.
export const dynamic = "force-dynamic";

type Done = Awaited<ReturnType<typeof listDoneDays>>[number];

export default async function PracticePage() {
  let days: Done[];
  let summary: ReviewNumbers = null;
  let checkpoints: CheckpointOverviewEntry[] = [];
  try {
    const userId = await getCurrentUserId();
    days = await listDoneDays(getDb(), userId);
    try {
      // The server's clock decides "today" (in the learner's zone, inside getReviewSummary); the same definition as /review.
      summary = await getReviewSummary(getDb(), userId, new Date());
    } catch (e) {
      console.error("Cannot read the review summary:", e); // the lessons below still work; the card says it could not count
    }
    try {
      // The server's clock only decides `completedToday`, which this page does not use. A failure leaves the section out.
      checkpoints = await getCheckpointOverview(getDb(), userId, { getCheckpoint }, new Date());
    } catch (e) {
      console.error("Cannot read the monthly checkpoints:", e);
    }
  } catch (e) {
    console.error("Cannot read the finished days:", e);
    return <DbErrorScreen retryHref="/practice" underNav />;
  }

  const rows = days.map((d) => {
    let lesson: Lesson | null = null;
    try {
      lesson = getLesson(d.day);
    } catch (e) {
      console.error(`Cannot load lesson for day ${d.day}:`, e); // a missing or invalid file hides that row's content only
    }
    return { ...d, lesson };
  });

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-14">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight">ฝึกเพิ่ม</h1>
        <p className="text-sm text-muted">เล่นทั้งบทจนจบและตอบอย่างน้อยหนึ่งข้อ นับสตรีค · เล่นทีละทักษะไม่นับ · คะแนนเดิมของบทไม่เปลี่ยน</p>
      </header>
      <PracticeReviewCard summary={summary} />
      <PracticeCheckpointSection entries={checkpoints} />
      <h2 className="text-base font-medium text-muted">เล่นบทที่เรียนแล้วซ้ำ</h2>
      {rows.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
          <p className="text-base">ยังไม่มีบทที่เรียนจบ เรียนบทแรกให้จบก่อน</p>
          <Link href="/today" className={buttonClass("primary")}>ไปบทเรียนวันนี้</Link>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {rows.map(({ day, score, lesson }) => (
            <li key={day}>
              {lesson ? (
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-good/40 bg-good-soft text-sm font-bold text-good-fg">{day}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted">วันที่ {day}</span>
                      <span lang="en" className="block break-words text-base font-semibold">{lesson.title.en}</span>
                      <span className="block break-words text-sm text-muted">{lesson.title.th}</span>
                    </span>
                    {score !== null && <span className="shrink-0 text-sm text-muted">คะแนน {Math.round(score * 100)}%</span>}
                    <svg data-chevron aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 7.5 5 5 5-5" />
                    </svg>
                  </summary>
                  <div className="flex flex-col gap-2.5 border-t border-line px-4 pb-4 pt-3.5">
                    <Link href={replayHref(day, null)} className={buttonClass("primary")}>เล่นทั้งบท{" "}<span className="sr-only">วันที่ {day}</span></Link>
                    {replaySkills(lesson).map(({ skill, exercises }) => (
                      <Link key={skill} href={replayHref(day, skill)} className={buttonClass("secondary")}>
                        {REPLAY_SKILL_LABEL_TH[skill]} · {exercises} ข้อ{" "}<span className="sr-only">วันที่ {day}</span>
                      </Link>
                    ))}
                  </div>
                </details>
              ) : (
                <p className="flex min-h-14 items-center px-4 py-3 text-sm text-muted">วันที่ {day} · ไม่มีเนื้อหา</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
