"use client";
import Link from "next/link";
import { Card } from "@/components/exercises/ui/Card";
import { buttonClass } from "@/components/ui/button-styles";
import type { CompleteResult } from "@/lib/offline/sink";
import { UnsavedNote } from "./UnsavedNote";

/** `error` = completeLesson threw or its promise rejected: nothing was decided, so trying again is safe. */
export type Completion = CompleteResult | { status: "error" };

/** `result` is null while completeLesson is in flight. `localScore` (0..1, first attempts) is the fallback when the server did not give one. */
export function CompletionScreen({
  day, result, localScore, onRetry,
}: { day: number; result: Completion | null; localScore: number | null; onRetry(): void }) {
  const serverScore = result?.status === "done" ? result.response.progress.score : null;
  const score = serverScore ?? localScore;
  const nextDay = result?.status === "done" && result.response.currentDay > day ? result.response.currentDay : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-16">
      <div className="flex flex-col gap-3">
        <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full border border-good/40 bg-good-soft text-xl font-bold text-good-fg">✓</span>
        <h1 className="text-2xl font-bold leading-snug">จบบทเรียนแล้ว</h1>
      </div>
      {(score !== null || result?.status === "done") && (
        <Card pad="px-4 py-1" className="divide-y divide-line">
          {score !== null && <p className="py-3 text-lg font-bold">คะแนนบทเรียน {Math.round(score * 100)}%</p>}
          {result?.status === "done" && (
            <p className="py-3 text-lg font-bold">สตรีค {result.response.streak.current} วัน (นานที่สุด {result.response.streak.longest} วัน)</p>
          )}
        </Card>
      )}
      {result === null && <p className="text-sm text-muted">กำลังบันทึก…</p>}
      {result?.status === "queued" && <p className="rounded-xl border border-hint/40 bg-hint-soft p-3.5 text-sm text-hint-fg">จะบันทึกเมื่อออนไลน์</p>}
      {result?.status === "rejected" && (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad-soft p-3.5 text-sm text-bad-fg">
          {result.code === 409
            ? "บทเรียนนี้ยังถูกล็อกอยู่ จึงบันทึกผลไม่ได้ ให้เรียนบทก่อนหน้าให้จบก่อน"
            : "บันทึกไม่สำเร็จ กรุณาลองเรียนบทนี้ใหม่อีกครั้งภายหลัง"}
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
        {nextDay !== null && <Link href={`/day/${nextDay}`} className={buttonClass("primary")}>ไปบทถัดไป</Link>}
        <Link href="/" className={buttonClass("secondary")}>กลับหน้าแรก</Link>
      </div>
    </main>
  );
}
