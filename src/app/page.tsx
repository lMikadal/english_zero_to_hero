import Link from "next/link";
import { getDb } from "@/db/client";
import { getLearnerHome, type LearnerHome } from "@/db/queries/home";
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <h1 className="text-3xl font-bold">English Zero to Hero</h1>
      <p className="text-lg text-slate-600">ฝึกภาษาอังกฤษทุกวัน จากศูนย์สู่มือโปร</p>
      <p className="text-2xl font-semibold">วันที่ {home.currentDay} / {COURSE_DAYS}</p>
      <p className="text-lg">สตรีค {home.streak.current} วัน</p>
      {home.activeToday && <p className="text-green-800">วันนี้เรียนแล้ว ✓</p>}
      {home.courseComplete ? (
        <p className="w-full rounded-xl bg-green-50 p-4 text-lg font-semibold text-green-900">
          เรียนครบ {COURSE_DAYS} วันแล้ว ยินดีด้วย!
        </p>
      ) : (
        <Link
          href={`/day/${home.currentDay}`}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-sky-600 px-4 text-lg font-semibold text-white"
        >
          เริ่มบทเรียนวันที่ {home.currentDay}
        </Link>
      )}
    </main>
  );
}
