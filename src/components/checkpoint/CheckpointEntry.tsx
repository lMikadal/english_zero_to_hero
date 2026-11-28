// The doors to /checkpoint/A from the main screens (docs/plans/checkpoint-plan.md PR 6, D10). Server components: they only show
// what the page read from the database. Percentages are rounded down (percentShown), like on the result screen.
import Link from "next/link";
import { MonthlyTitle } from "./MonthlyTitle";
import { checkpointNumber, percentShown } from "./view";

const CHEVRON = (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7.5 5 5 5-5 5" />
  </svg>
);

/** Home, while checkpoint A blocks day A+1: it takes the place of the lesson card, with one primary link and no lesson start. */
export function HomeCheckpointCard({ afterDay }: { afterDay: number }) {
  const k = checkpointNumber(afterDay);
  return (
    <section aria-label="แบบทดสอบประจำเดือน" className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
      <div>
        <p className="text-sm font-medium text-muted">วันที่ 1–{afterDay}</p>
        <h2 className="text-2xl font-bold leading-snug"><MonthlyTitle k={k} /></h2>
      </div>
      <p className="text-pretty text-sm leading-relaxed text-muted">ทำแบบทดสอบให้จบ ได้กี่คะแนนก็ได้ แล้ว<span className="whitespace-nowrap">บทเรียนวันที่ {afterDay + 1}</span> จะเปิดให้</p>
      <Link href={`/checkpoint/${afterDay}`} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-lg font-semibold text-on-accent">
        เริ่มแบบทดสอบ
      </Link>
    </section>
  );
}

/** Home, when nothing is blocked but a checkpoint is still open: a quiet row under the lesson card (same look as HomeReviewLink). */
export function HomeCheckpointLink({ note }: { note: { afterDay: number; status: "not_taken" | "not_passed" } | null }) {
  if (note === null) return null;
  const k = checkpointNumber(note.afterDay);
  // "ดูผลและฝึกซ่อม" stays on one line so Thai never breaks it into an orphan "ซ่อม" at 360px
  const text = note.status === "not_taken" ? `แบบทดสอบครั้งที่ ${k} · ยังไม่ได้สอบ` : `แบบทดสอบครั้งที่ ${k} · ยังไม่ผ่าน `;
  return (
    <Link href={`/checkpoint/${note.afterDay}`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 text-[15px] font-medium text-fg">
      <span>
        {text}
        {note.status === "not_passed" ? <span className="whitespace-nowrap">ดูผลและฝึกซ่อม</span> : null}
      </span>
      {CHEVRON}
    </Link>
  );
}

export type PracticeEntry = { afterDay: number; status: "not_taken" | "passed" | "not_passed"; latest: number | null; best: number | null };

function statusText(e: PracticeEntry): string {
  if (e.status === "passed") return `ผ่าน · ดีที่สุด ${percentShown(e.best ?? 0)}%`;
  if (e.status === "not_passed") return `ยังไม่ผ่าน · ล่าสุด ${percentShown(e.latest ?? 0)}%`;
  return "ยังไม่ได้สอบ";
}

/** /practice: between the vocabulary review card and the replay list, one row per open checkpoint; nothing when none is open. */
export function PracticeCheckpointSection({ entries }: { entries: readonly PracticeEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-medium text-muted">แบบทดสอบประจำเดือน</h2>
      <ul aria-label="แบบทดสอบประจำเดือน" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {entries.map((e) => (
          <li key={e.afterDay}>
            <Link href={`/checkpoint/${e.afterDay}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-base font-semibold">ครั้งที่ {checkpointNumber(e.afterDay)} · วันที่ 1–{e.afterDay}</span>
                <span className="block break-words text-sm text-muted">{statusText(e)}</span>
              </span>
              {CHEVRON}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
