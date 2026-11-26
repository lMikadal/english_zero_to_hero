"use client";
import Link from "next/link";
import { Card } from "@/components/exercises/ui/Card";
import { buttonClass } from "@/components/ui/button-styles";
import type { CompletePracticeResponse, ReplaySkill } from "@/lib/attempts/contract";
import type { CompleteResult } from "@/lib/offline/sink";
import { replayHref } from "@/lib/practice/replay";
import { UnsavedNote } from "./UnsavedNote";

/** `error` = completePractice threw or its promise rejected: nothing was decided, so trying again is safe. */
export type PracticeCompletion = CompleteResult<CompletePracticeResponse> | { status: "error" };

/**
 * End of a replay (docs/plans/replay-plan.md 3.6). `result` is null while completePractice is in flight; `localScore`
 * (0..1, first attempts) is the fallback until the server answers. No "next lesson": a replay never moves the learner on.
 * `onReplay` lets the player start a fresh session in place (the link alone would not remount it).
 */
export function PracticeCompletionScreen({
  day, skill, result, localScore, onRetry, onReplay,
}: { day: number; skill: ReplaySkill | null; result: PracticeCompletion | null; localScore: number | null; onRetry(): void; onReplay?(): void }) {
  const done = result?.status === "done" ? result.response : null;
  const score = done ? done.session.score : localScore;
  // Whole lesson, nothing scored and the server did not count it: no answer was stored at all (a self-rated answer would have counted).
  const noAnswers = skill === null && done !== null && done.session.score === null && !done.countedForStreak;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-16">
      <div className="flex flex-col gap-3">
        <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full border border-good/40 bg-good-soft text-xl font-bold text-good-fg">✓</span>
        <h1 className="text-2xl font-bold leading-snug">จบการเล่นซ้ำแล้ว</h1>
      </div>
      <Card pad="px-4 py-1" className="divide-y divide-line">
        {score !== null && <p className="py-3 text-lg font-bold">คะแนนรอบนี้ {Math.round(score * 100)}%</p>}
        {score === null && skill !== null && <p className="py-3 text-base font-bold">ส่วนนี้ประเมินตัวเอง ไม่มีคะแนน</p>}
        {score === null && skill === null && (noAnswers
          ? <p className="py-3 text-base font-bold">ไม่มีคำตอบที่บันทึกในรอบนี้ จึงไม่นับสตรีค</p>
          : <p className="py-3 text-base font-bold">รอบนี้ไม่มีข้อที่ให้คะแนน</p>)}
        {done && done.lessonScore !== null && (
          <p className="py-3 text-base text-muted">คะแนนเดิมของบท {Math.round(done.lessonScore * 100)}% (ไม่เปลี่ยน)</p>
        )}
        {skill !== null && <p className="py-3 text-sm text-muted">ฝึกแยกส่วนไม่นับสตรีค นับเมื่อเล่นทั้งบทจนจบ</p>}
        {skill === null && done && (done.countedForStreak
          ? <p className="py-3 text-lg font-bold">สตรีค {done.streak.current} วัน (นานที่สุด {done.streak.longest} วัน)</p>
          : !noAnswers && <p className="py-3 text-sm text-muted">รอบนี้ไม่ได้นับเพิ่มในสตรีค</p>)}
      </Card>
      {result === null && <p className="text-sm text-muted">กำลังบันทึก…</p>}
      {result?.status === "queued" && <p className="rounded-xl border border-hint/40 bg-hint-soft p-3.5 text-sm text-hint-fg">จะบันทึกเมื่อออนไลน์</p>}
      {result?.status === "rejected" && (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad-soft p-3.5 text-sm text-bad-fg">
          {result.code === 409
            ? "บทนี้ยังเล่นซ้ำไม่ได้ (ยังเรียนไม่จบ หรือไม่มีส่วนนี้)"
            : "บันทึกไม่สำเร็จ กรุณาลองเล่นซ้ำอีกครั้งภายหลัง"}
        </p>
      )}
      {result?.status === "error" && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-bad/40 bg-bad-soft p-3.5 text-sm text-bad-fg">
          <p>บันทึกไม่สำเร็จ ลองอีกครั้งได้</p>
          <button type="button" onClick={onRetry} className={buttonClass("quiet")}>ลองอีกครั้ง</button>
        </div>
      )}
      <UnsavedNote />
      <div className="mt-auto flex flex-col gap-2.5 pt-3">
        <Link
          href={replayHref(day, skill)}
          onClick={onReplay ? (e) => { e.preventDefault(); onReplay(); } : undefined}
          className={buttonClass("primary")}
        >
          เล่นอีกครั้ง
        </Link>
        <Link href="/practice" className={buttonClass("secondary")}>กลับไปหน้าฝึกเพิ่ม</Link>
        <Link href="/" className={buttonClass("secondary")}>กลับหน้าแรก</Link>
      </div>
    </main>
  );
}
