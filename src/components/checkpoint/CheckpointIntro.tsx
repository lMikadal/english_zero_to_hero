"use client";
import Link from "next/link";
import { AudioFallback, useExerciseAudio } from "@/components/audio/AudioControls";
import { Card } from "@/components/exercises/ui/Card";
import { buttonClass } from "@/components/ui/button-styles";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import { CHECKPOINT_RESUME_HOURS } from "@/lib/progress/config";
import { REPLAY_SKILL_LABEL_TH } from "@/lib/practice/replay";
import { percentShown, resumeNumber, totalExercises } from "./view";

const RULES = [
  "ระหว่างทำจะไม่บอกว่าถูกหรือผิด ดูผลรวมตอนจบ",
  "ทำทีละข้อ ย้อนกลับไม่ได้",
  "ส่วนพูดให้ประเมินตัวเอง ไม่นับคะแนน",
  `ปิดหน้าแล้วกลับมาทำต่อได้ภายใน ${CHECKPOINT_RESUME_HOURS} ชั่วโมง`,
];
const NO_SOUND = "อุปกรณ์นี้ยังเล่นเสียงภาษาอังกฤษไม่ได้ ข้อฟังจะข้ามและนับ 0 คะแนน ลองทำบนเครื่องที่มีเสียงจะได้คะแนนครบ";

/**
 * Before the test (docs/plans/checkpoint-plan.md 3.3 item 18): what it is, the rules, what is in it, one button.
 * `resume` = a sitting left open (its stored answers); `last` = the latest finished sitting of an earlier day.
 */
export function CheckpointIntro({
  checkpoint, resume, last, onStart,
}: { checkpoint: Checkpoint; resume: { answered: readonly string[] } | null; last: { score: number; passed: boolean } | null; onStart(): void }) {
  const total = totalExercises(checkpoint);
  // The first listening exercise stands for "does this device have English sound?" (the same check the exercises make).
  const sample = checkpoint.sections.flatMap((s) => s.exercises).map((e) => (e.type === "listen_choose" ? e.audioText : e.type === "dictation" ? e.audioText : null)).find((t) => t !== null) ?? "Hello";
  const audio = useExerciseAudio(sample);
  const label = resume ? `ทำต่อ (ข้อ ${resumeNumber(checkpoint, resume.answered)} / ${total})` : last ? "สอบอีกครั้ง" : "เริ่มแบบทดสอบ";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-snug text-fg">{checkpoint.title.th}</h1>
        <p className="text-[15px] text-muted">บทเรียนวันที่ 1–{checkpoint.afterDay} · {total} ข้อ · ประมาณ {checkpoint.estimatedMinutes} นาที</p>
        <p className="text-pretty text-sm leading-relaxed text-muted">ไม่มีเวลาจำกัด ทำเท่าที่ทำได้ ผลนี้ช่วยให้รู้ว่าควรทบทวนส่วนไหน</p>
        {last ? (
          <p className="self-start rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium text-fg">
            ครั้งล่าสุด {percentShown(last.score)}% · {last.passed ? "ผ่าน" : "ยังไม่ผ่าน"}
          </p>
        ) : null}
      </header>

      <Card pad="px-4 py-3.5">
        <h2 className="mb-2 text-[13px] font-medium text-muted">กติกา</h2>
        <ul aria-label="กติกา" className="flex flex-col gap-2.5">
          {RULES.map((r) => (
            <li key={r} className="flex gap-2.5 text-[15px] leading-relaxed text-fg">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              <span className="text-pretty">{r}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card pad="px-4 py-1">
        <ul aria-label="ส่วนของแบบทดสอบ" className="divide-y divide-line">
          {checkpoint.sections.map((s) => (
            <li key={s.skill} className="flex items-baseline justify-between gap-2 py-3 text-[15px]">
              <span className="font-medium text-fg">{REPLAY_SKILL_LABEL_TH[s.skill]}</span>
              <span className="text-[13px] text-muted">{s.exercises.length} ข้อ{s.weight === 0 ? " · ไม่นับคะแนน" : ""}</span>
            </li>
          ))}
        </ul>
      </Card>

      <AudioFallback audio={audio} note={NO_SOUND} />

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        <button type="button" onClick={onStart} className={buttonClass("primary")}>{label}</button>
        <Link href="/" className={buttonClass("secondary")}>กลับหน้าแรก</Link>
      </div>
    </main>
  );
}
