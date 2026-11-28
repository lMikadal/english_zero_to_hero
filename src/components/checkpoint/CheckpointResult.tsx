"use client";
import Link from "next/link";
import { Card } from "@/components/exercises/ui/Card";
import { UnsavedNote } from "@/components/player/UnsavedNote";
import { buttonClass } from "@/components/ui/button-styles";
import { type CheckpointSkillResult } from "@/lib/attempts/contract";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import { isCheckpointPass, weakSkills } from "@/lib/checkpoints/score";
import { CHECKPOINT_PASS_SCORE } from "@/lib/progress/config";
import { REPLAY_SKILL_LABEL_TH, replayHref } from "@/lib/practice/replay";
import { checkpointNumber, percentShown, practisedKey, rejectedMessage, type Completion, type ResultDisplay } from "./view";

const pct = percentShown;
const TEXT = "text-sm leading-relaxed text-muted";

/**
 * The result of a monthly checkpoint (docs/plans/checkpoint-plan.md 3.6). Calm on purpose: "ยังไม่ผ่าน" is amber with words
 * (red is for errors, not for a score), the bars are the one accent colour, and the only primary action is the way on.
 * `completion` is what the server said; `practised` holds "<day>:<skill>" for the replay links already played after this sitting.
 */
export function CheckpointResult({
  checkpoint, completion, practised, onRetry, onRestart,
}: { checkpoint: Checkpoint; completion: Completion; practised: ReadonlySet<string>; onRetry(): void; onRestart(): void }) {
  const k = checkpointNumber(checkpoint.afterDay);
  const shown = completion.kind === "shown" ? completion.display : null;
  const rejection = completion.kind === "rejected" ? rejectedMessage(completion.code) : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-14">
      <h1 className="text-2xl font-bold leading-snug text-fg">ผลแบบทดสอบ ครั้งที่ {k}</h1>
      {shown ? <Shown checkpoint={checkpoint} display={shown} practised={practised} /> : null}
      {completion.kind === "pending" && <p className={TEXT}>กำลังบันทึก…</p>}
      {completion.kind === "queued" && (
        <p className="rounded-xl border border-hint/40 bg-hint-soft p-3.5 text-sm leading-relaxed text-hint-fg">จะแสดงผลเมื่อออนไลน์</p>
      )}
      {completion.kind === "rejected" && (
        <div role="alert" className="flex flex-col gap-1.5 rounded-xl border border-bad/40 bg-bad-soft p-3.5 text-sm leading-relaxed text-bad-fg">
          <p>{rejection?.text}</p>
        </div>
      )}
      {completion.kind === "error" && (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad-soft p-3.5 text-sm leading-relaxed text-bad-fg">บันทึกผลไม่สำเร็จ ลองอีกครั้งได้</p>
      )}
      {completion.kind !== "shown" ? <UnsavedNote /> : null}
      <div className="mt-auto flex flex-col gap-2.5 pt-3">
        {shown ? <p className="text-center text-[13px] text-muted">สอบอีกครั้งได้ตั้งแต่พรุ่งนี้</p> : null}
        {shown && shown.nextDay !== null ? (
          <Link href={`/day/${shown.nextDay}`} className={buttonClass("primary")}>ไปบทเรียนวันที่ {shown.nextDay}</Link>
        ) : null}
        {rejection?.restart ? <button type="button" onClick={onRestart} className={buttonClass("primary")}>เริ่มทำใหม่</button> : null}
        {completion.kind === "error" ? <button type="button" onClick={onRetry} className={buttonClass("primary")}>ลองอีกครั้ง</button> : null}
        {(rejection ? rejection.restart : completion.kind === "error" || completion.kind === "pending" || completion.kind === "queued" || (shown && shown.nextDay !== null)) ? (
          <Link href="/" className={buttonClass("secondary")}>กลับหน้าแรก</Link>
        ) : (
          <Link href="/" className={buttonClass("primary")}>กลับหน้าแรก</Link>
        )}
      </div>
    </main>
  );
}

function Shown({ checkpoint, display, practised }: { checkpoint: Checkpoint; display: ResultDisplay; practised: ReadonlySet<string> }) {
  const { result, streak } = display;
  const passed = isCheckpointPass(result.score);
  const weak = weakSkills(result.skills);
  return (
    <>
      <div className="flex flex-col gap-2">
        <p
          className={`inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1 text-sm font-semibold ${
            passed ? "border-good/40 bg-good-soft text-good-fg" : "border-hint/40 bg-hint-soft text-hint-fg"
          }`}
        >
          <span aria-hidden="true">{passed ? "✓" : "○"}</span>
          <span>{passed ? "ผ่าน" : "ยังไม่ผ่าน"}</span>
        </p>
        <p className="text-3xl font-bold leading-snug text-fg">คะแนนรวม {pct(result.score)}%</p>
        <p className="text-[13px] text-muted">เกณฑ์ผ่าน {pct(CHECKPOINT_PASS_SCORE)}%</p>
        <p className={TEXT}>
          {passed
            ? "ทำได้ดีมาก ไปบทถัดไปได้เลย"
            : "ยังไม่ถึงเกณฑ์ ไม่เป็นไร ฝึกซ่อมส่วนที่ยังไม่แน่นแล้วสอบอีกครั้งได้"}
        </p>
      </div>

      <section aria-labelledby="skills-h" className="flex flex-col gap-2">
        <h2 id="skills-h" className="text-[13px] font-medium text-muted">คะแนนรายทักษะ</h2>
        <Card pad="px-4 py-1" className="p-0">
          <ul aria-label="คะแนนรายทักษะ" className="divide-y divide-line px-4">
            {result.skills.map((s) => <SkillRow key={s.skill} s={s} />)}
          </ul>
        </Card>
      </section>

      {weak.length > 0 ? (
        <section aria-labelledby="repair-h" className="flex flex-col gap-2">
          <h2 id="repair-h" className="text-base font-bold text-fg">ควรฝึกซ่อม</h2>
          <p className={TEXT}>เล่นซ้ำส่วนนี้ของบทที่เคยเรียน ไม่กระทบคะแนนบท</p>
          <ul className="flex flex-col gap-2">
            {weak.flatMap((s) => {
              const days = checkpoint.sections.find((c) => c.skill === s.skill)?.reviewDays ?? [];
              return days.map((day) => {
                const label = `${REPLAY_SKILL_LABEL_TH[s.skill]} · วันที่ ${day}`;
                const done = practised.has(practisedKey(day, s.skill));
                return (
                  <li key={`${s.skill}-${day}`}>
                    <Link href={replayHref(day, s.skill)} aria-label={done ? `${label} ฝึกแล้ว` : undefined} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] font-medium text-fg">
                      <span>{label}</span>
                      {done ? (
                        <span className="text-[13px] font-medium text-good-fg">
                          <span aria-hidden="true">✓ ฝึกแล้ว</span>
                        </span>
                      ) : <span aria-hidden="true" className="text-muted">›</span>}
                    </Link>
                  </li>
                );
              });
            })}
          </ul>
        </section>
      ) : null}

      {streak || result.sitting > 1 ? (
        <Card pad="px-4 py-1" className="divide-y divide-line">
          {streak ? <p className="py-3 text-base font-bold">สตรีค {streak.current} วัน (นานที่สุด {streak.longest} วัน)</p> : null}
          {result.sitting > 1 ? <p className="py-3 text-sm text-muted">รอบที่ {result.sitting} · ดีที่สุด {pct(result.best)}%</p> : null}
        </Card>
      ) : null}
    </>
  );
}

function SkillRow({ s }: { s: CheckpointSkillResult }) {
  const name = REPLAY_SKILL_LABEL_TH[s.skill];
  if (s.weight === 0 || s.score === null) {
    return (
      <li className="flex flex-col gap-1 py-3">
        <span className="text-[15px] font-medium text-fg">{name}</span>
        <span className="text-[13px] text-muted">ประเมินตัวเอง พูดได้ {s.selfOk ?? 0} จาก {s.total} ข้อ · ไม่นับคะแนน</span>
      </li>
    );
  }
  const value = pct(s.score);
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-medium text-fg">{name}</span>
        <span className="text-[13px] text-muted">{value}% · ตอบ {s.answered} จาก {s.total} ข้อ</span>
      </span>
      <span role="progressbar" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="block h-1.5 rounded-full bg-line">
        <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${value}%` }} />
      </span>
    </li>
  );
}
