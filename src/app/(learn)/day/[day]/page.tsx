import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button-styles";
import { DbErrorScreen } from "@/components/ui/DbErrorScreen";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { DayPlayer } from "@/components/player/DayPlayer";
import { isDayUnlocked } from "@/lib/attempts/unlock";
import { getLesson, getVocabLookup } from "@/lib/content/repo";
import type { Lesson } from "@/lib/content/schema";
import { REPLAY_SKILL_LABEL_TH, parseReplaySkill, replayHref, replaySkills } from "@/lib/practice/replay";
import { getDayStatus, getGate } from "../../access";
import { vocabIdsFor } from "./vocab-ids";

// The lock depends on the learner, so this page must never be cached.
export const dynamic = "force-dynamic";

const TEXT = "text-sm leading-relaxed text-muted";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DayPage({ params, searchParams }: { params: Promise<{ day: string }>; searchParams?: SearchParams }) {
  const { day: raw } = await params;
  // Canonical form only: "/day/007" is not a day page.
  if (!/^[1-9]\d{0,2}$/.test(raw) || Number(raw) > 365) notFound();
  const day = Number(raw);
  // ?skill= picks one skill of a replay; anything but one valid skill (repeated, empty, vocabulary, upper case) is not a page.
  const skill = parseReplaySkill(((await searchParams) ?? {}).skill);
  if (skill === "invalid") notFound();

  let currentDay: number;
  let blocking: number | null;
  let playableDay: number;
  try {
    ({ currentDay, blocking, playableDay } = await getGate());
  } catch (e) {
    console.error("Cannot read the learner's current day:", e);
    return <DbErrorScreen retryHref={replayHref(day, skill)} />;
  }
  // A monthly checkpoint holds the next day back: say so and give the way in (the one primary action).
  if (blocking !== null && day === currentDay) {
    return (
      <StatusScreen
        icon="📝"
        title="ทำแบบทดสอบประจำเดือนก่อน"
        actions={<Link href={`/checkpoint/${blocking}`} className={buttonClass("primary")}>ไปทำแบบทดสอบ</Link>}
      >
        <p className={TEXT}>ทำแบบทดสอบหลังบทเรียนวันที่ {blocking} ให้จบ (ได้กี่คะแนนก็ได้) แล้วบทวันที่ {day} จะเปิดให้</p>
      </StatusScreen>
    );
  }
  if (!isDayUnlocked(day, currentDay)) {
    return (
      <StatusScreen
        icon="🔒"
        title="ยังไม่ปลดล็อก"
        actions={<Link href={`/day/${playableDay}`} className={buttonClass("primary")}>ไปบทเรียนวันที่ {playableDay}</Link>}
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

  // A finished day opens as a replay (practice mode); anything else is the lesson. The player remembers this at mount.
  let finished: boolean;
  try {
    finished = (await getDayStatus(day)) === "done";
  } catch (e) {
    console.error(`Cannot read the status of day ${day}:`, e);
    return <DbErrorScreen retryHref={replayHref(day, skill)} />;
  }

  if (skill !== null && !finished) {
    return (
      <StatusScreen
        icon="🔒"
        title="ฝึกแยกส่วนได้หลังเรียนบทนี้จบ"
        actions={<Link href={`/day/${day}`} className={buttonClass("primary")}>ไปเรียนบทวันที่ {day}</Link>}
      >
        <p className={TEXT}>เรียนบทวันที่ {day} ให้จบก่อน แล้วจึงเลือกฝึกทีละทักษะได้</p>
      </StatusScreen>
    );
  }
  if (skill !== null && !replaySkills(lesson).some((s) => s.skill === skill)) {
    return (
      <StatusScreen
        title={`บทนี้ไม่มีส่วน${REPLAY_SKILL_LABEL_TH[skill]}`}
        actions={<Link href="/practice" className={buttonClass("primary")}>กลับไปหน้าฝึกเพิ่ม</Link>}
      >
        <p className={TEXT}>บทวันที่ {day} ไม่มีส่วนนี้ เลือกส่วนอื่นหรือเล่นทั้งบทได้ที่หน้าฝึกเพิ่ม</p>
      </StatusScreen>
    );
  }

  return <DayPlayer lesson={lesson} vocab={getVocabLookup(vocabIdsFor(lesson))} mode={finished ? "practice" : "lesson"} skill={skill} />;
}
