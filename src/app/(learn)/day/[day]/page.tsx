import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button-styles";
import { DbErrorScreen } from "@/components/ui/DbErrorScreen";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { DayPlayer } from "@/components/player/DayPlayer";
import { isDayUnlocked } from "@/lib/attempts/unlock";
import { getLesson, getVocabLookup } from "@/lib/content/repo";
import type { Lesson } from "@/lib/content/schema";
import { getCurrentDay } from "../../access";
import { vocabIdsFor } from "./vocab-ids";

// The lock depends on the learner, so this page must never be cached.
export const dynamic = "force-dynamic";

const TEXT = "text-sm leading-relaxed text-muted";

export default async function DayPage({ params }: { params: Promise<{ day: string }> }) {
  const { day: raw } = await params;
  // Canonical form only: "/day/007" is not a day page.
  if (!/^[1-9]\d{0,2}$/.test(raw) || Number(raw) > 365) notFound();
  const day = Number(raw);

  let currentDay: number;
  try {
    currentDay = await getCurrentDay();
  } catch (e) {
    console.error("Cannot read the learner's current day:", e);
    return <DbErrorScreen retryHref={`/day/${day}`} />;
  }
  if (!isDayUnlocked(day, currentDay)) {
    return (
      <StatusScreen
        icon="🔒"
        title="ยังไม่ปลดล็อก"
        actions={<Link href={`/day/${currentDay}`} className={buttonClass("primary")}>ไปบทเรียนวันที่ {currentDay}</Link>}
      >
        <p className={TEXT}>เรียนบทก่อนหน้าให้จบตามลำดับก่อน แล้วบทวันที่ {day} จะเปิดให้</p>
      </StatusScreen>
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
      <StatusScreen
        title="ยังไม่มีบทเรียนของวันนี้"
        actions={<Link href="/" className={buttonClass("primary")}>กลับหน้าแรก</Link>}
      >
        <p className={TEXT}>บทเรียนวันที่ {day} ยังเขียนไม่เสร็จ กลับมาใหม่เร็วๆ นี้</p>
      </StatusScreen>
    );
  }

  return <DayPlayer lesson={lesson} vocab={getVocabLookup(vocabIdsFor(lesson))} />;
}
