import Link from "next/link";
import { notFound } from "next/navigation";
import { DayPlayer } from "@/components/player/DayPlayer";
import { isDayUnlocked } from "@/lib/attempts/unlock";
import { getLesson, getVocabLookup } from "@/lib/content/repo";
import type { Lesson } from "@/lib/content/schema";
import { getCurrentDay } from "../../access";
import { vocabIdsFor } from "./vocab-ids";

// The lock depends on the learner, so this page must never be cached.
export const dynamic = "force-dynamic";

const SCREEN = "mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4";
const LINK = "flex min-h-11 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-base font-semibold text-white";

export default async function DayPage({ params }: { params: Promise<{ day: string }> }) {
  const { day: raw } = await params;
  // Canonical form only: "/day/007" is not a day page.
  if (!/^[1-9]\d{0,2}$/.test(raw) || Number(raw) > 365) notFound();
  const day = Number(raw);

  const currentDay = await getCurrentDay();
  if (!isDayUnlocked(day, currentDay)) {
    return (
      <main className={SCREEN}>
        <h1 className="text-2xl font-bold">ยังไม่ปลดล็อก</h1>
        <p>เรียนบทก่อนหน้าให้จบตามลำดับก่อน แล้วบทวันที่ {day} จะเปิดให้</p>
        <Link href={`/day/${currentDay}`} className={LINK}>ไปบทเรียนวันที่ {currentDay}</Link>
      </main>
    );
  }

  let lesson: Lesson | null = null;
  try {
    lesson = getLesson(day);
  } catch (e) {
    console.error(`Cannot load lesson for day ${day}:`, e); // an invalid content file must not take the page down
  }
  if (!lesson) {
    return (
      <main className={SCREEN}>
        <h1 className="text-2xl font-bold">ยังไม่มีบทเรียนของวันนี้</h1>
        <p>บทเรียนวันที่ {day} ยังเขียนไม่เสร็จ กลับมาใหม่เร็วๆ นี้</p>
        <Link href="/" className={LINK}>กลับหน้าแรก</Link>
      </main>
    );
  }

  return <DayPlayer lesson={lesson} vocab={getVocabLookup(vocabIdsFor(lesson))} />;
}
