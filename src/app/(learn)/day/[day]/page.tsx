import Link from "next/link";
import { notFound } from "next/navigation";
import { DayPlayer } from "@/components/player/DayPlayer";
import { isDayUnlocked } from "@/lib/attempts/unlock";
import { getLesson, getVocabLookup } from "@/lib/content/repo";
import { getCurrentDay } from "../../access";
import { vocabIdsFor } from "./vocab-ids";

const SCREEN = "mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4";
const LINK = "flex min-h-11 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-base font-semibold text-white";

export default async function DayPage({ params }: { params: Promise<{ day: string }> }) {
  const { day: raw } = await params;
  const day = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(day) || day < 1 || day > 365) notFound();

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

  const lesson = getLesson(day);
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
