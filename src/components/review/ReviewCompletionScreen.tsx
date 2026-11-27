"use client";
import Link from "next/link";
import { Card } from "@/components/exercises/ui/Card";
import { UnsavedNote } from "@/components/player/UnsavedNote";
import { buttonClass } from "@/components/ui/button-styles";
import type { CompleteResult } from "@/lib/offline/sink";
import type { CompleteReviewResponse } from "@/lib/srs/contract";
import { RATINGS, RATING_LABEL_TH, type Rating } from "@/lib/srs/scheduler";

/** `error` = completeReview threw or its promise rejected: nothing was decided, so asking again is safe. */
export type ReviewCompletion = CompleteResult<CompleteReviewResponse> | { status: "error" };

/** End of a review session (plan 2.4 rule 19). `result` is null while completeReview is in flight. */
export function ReviewCompletionScreen({
  total, counts, result, onRetry, onContinue,
}: { total: number; counts: Record<Rating, number>; result: ReviewCompletion | null; onRetry(): void; onContinue(): void }) {
  const done = result?.status === "done" ? result.response : null;
  // Something is still due (a card the server did not store, or one that fell due meanwhile): "ทวนครบแล้ว" would contradict the line below.
  const leftOver = done !== null && done.remainingDue > 0;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-16">
      <div className="flex flex-col gap-3">
        <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full border border-good/40 bg-good-soft text-xl font-bold text-good-fg">✓</span>
        <h1 className="text-2xl font-bold leading-snug">{leftOver ? "จบรอบนี้แล้ว" : "ทวนครบแล้ว"}</h1>
      </div>
      <Card pad="px-4 py-1" className="divide-y divide-line">
        <p className="py-3 text-lg font-bold">{`ทวน ${total} ใบ`}</p>
        <p className="py-3 text-sm text-muted">{RATINGS.map((r) => `${RATING_LABEL_TH[r]} ${counts[r]}`).join(" · ")}</p>
        {done?.countedForStreak && <p className="py-3 text-lg font-bold">{`สตรีค ${done.streak.current} วัน (นานที่สุด ${done.streak.longest} วัน)`}</p>}
        {done && !done.countedForStreak && (
          <p className="py-3 text-sm text-muted">{done.remainingDue > 0 ? `ยังมีคำถึงกำหนดอีก ${done.remainingDue} ใบ` : "รอบนี้ไม่ได้นับเพิ่มในสตรีค"}</p>
        )}
      </Card>
      {result === null && <p className="text-sm text-muted">กำลังบันทึก…</p>}
      {result?.status === "queued" && <p className="rounded-xl border border-hint/40 bg-hint-soft p-3.5 text-sm text-hint-fg">จะบันทึกเมื่อออนไลน์</p>}
      {result?.status === "rejected" && (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad-soft p-3.5 text-sm text-bad-fg">บันทึกไม่สำเร็จ ผลการทวนรอบนี้จึงไม่ถูกนับในสตรีค</p>
      )}
      {result?.status === "error" && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-bad/40 bg-bad-soft p-3.5 text-sm text-bad-fg">
          <p>บันทึกไม่สำเร็จ ลองอีกครั้งได้</p>
          <button type="button" onClick={onRetry} className={buttonClass("quiet")}>ลองอีกครั้ง</button>
        </div>
      )}
      <UnsavedNote />
      <div className="mt-auto flex flex-col gap-2.5 pt-3">
        {done && !done.countedForStreak && leftOver && (
          <Link href="/review" onClick={(e) => { e.preventDefault(); onContinue(); }} className={buttonClass("primary")}>ทวนต่อ</Link>
        )}
        <Link href="/practice" className={buttonClass("secondary")}>กลับไปหน้าฝึกเพิ่ม</Link>
        <Link href="/" className={buttonClass("secondary")}>กลับหน้าแรก</Link>
      </div>
    </main>
  );
}
