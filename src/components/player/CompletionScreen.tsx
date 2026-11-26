"use client";
import Link from "next/link";
import type { CompleteResult } from "@/lib/offline/sink";
import { UnsavedNote } from "./UnsavedNote";

const LINK = "flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 text-base font-medium";

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">จบบทเรียนแล้ว</h1>
      {score !== null && <p className="text-lg">คะแนนบทเรียน {Math.round(score * 100)}%</p>}
      {result === null && <p className="text-zinc-600">กำลังบันทึก…</p>}
      {result?.status === "done" && (
        <p className="text-lg">สตรีค {result.response.streak.current} วัน (นานที่สุด {result.response.streak.longest} วัน)</p>
      )}
      {result?.status === "queued" && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">จะบันทึกเมื่อออนไลน์</p>}
      {result?.status === "rejected" && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {result.code === 409
            ? "บทเรียนนี้ยังถูกล็อกอยู่ จึงบันทึกผลไม่ได้ ให้เรียนบทก่อนหน้าให้จบก่อน"
            : "บันทึกไม่สำเร็จ กรุณาลองเรียนบทนี้ใหม่อีกครั้งภายหลัง"}
        </p>
      )}
      {result?.status === "error" && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-red-50 p-3 text-red-900">
          <p>บันทึกไม่สำเร็จ ลองอีกครั้งได้</p>
          <button type="button" onClick={onRetry} className={`${LINK} bg-white`}>ลองอีกครั้ง</button>
        </div>
      )}
      <UnsavedNote />
      {nextDay !== null && <Link href={`/day/${nextDay}`} className={`${LINK} bg-sky-600 text-white`}>ไปบทถัดไป</Link>}
      <Link href="/" className={LINK}>กลับหน้าแรก</Link>
    </main>
  );
}
