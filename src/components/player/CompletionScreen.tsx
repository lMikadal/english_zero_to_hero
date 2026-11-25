"use client";
import Link from "next/link";
import type { CompleteResult } from "@/lib/offline/sink";

const LINK = "flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 text-base font-medium";

/** `result` is null while completeLesson is in flight. `localScore` (0..1, first attempts) is the fallback when the server did not give one. */
export function CompletionScreen({ result, localScore }: { result: CompleteResult | null; localScore: number | null }) {
  const serverScore = result?.status === "done" ? result.response.progress.score : null;
  const score = serverScore ?? localScore;
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
      {result?.status === "done" && <Link href={`/day/${result.response.currentDay}`} className={`${LINK} bg-sky-600 text-white`}>ไปบทถัดไป</Link>}
      <Link href="/" className={LINK}>กลับหน้าแรก</Link>
    </main>
  );
}
