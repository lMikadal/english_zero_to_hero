// The two doors to /review from the main menus (docs/plans/vocab-review-plan.md 2.6 rules 26 and 27). Server components:
// they only show numbers the page read from the database. `null` = the numbers could not be read (never invent one).
import Link from "next/link";

export type ReviewNumbers = { due: number; withCard: number } | null;

/** /practice: the card above the replay list. Cards, not words: the number is the n of the "x / n" counter on /review. */
export function PracticeReviewCard({ summary }: { summary: ReviewNumbers }) {
  const line =
    summary === null ? "อ่านจำนวนคำที่ถึงกำหนดไม่ได้ ลองเปิดหน้านี้ใหม่"
    : summary.withCard === 0 ? "ยังไม่มีคำให้ทวน เรียนบทแรกให้จบก่อน"
    : summary.due === 0 ? "วันนี้ไม่มีคำถึงกำหนดทวน"
    : `ถึงกำหนด ${summary.due} ใบ`;
  return (
    <section aria-labelledby="review-card-title" className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="review-card-title" className="text-lg font-semibold">ทวนคำศัพท์</h2>
          <p className="break-words text-sm text-muted">{line}</p>
        </div>
        {summary !== null && summary.due > 0 && (
          <Link href="/review" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-on-accent">เริ่มทวน</Link>
        )}
      </div>
      <p className="text-xs text-muted">ทวนครบทุกใบที่ถึงกำหนด นับสตรีค</p>
    </section>
  );
}

/** Home: a quiet row under the lesson card, only when something is due. Secondary to the lesson button on purpose. */
export function HomeReviewLink({ summary }: { summary: ReviewNumbers }) {
  if (summary === null || summary.due === 0) return null;
  return (
    <Link href="/review" className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 text-[15px] font-medium text-fg">
      <span>{`ทวนคำศัพท์ · ถึงกำหนด ${summary.due} ใบ`}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7.5 5 5 5-5 5" />
      </svg>
    </Link>
  );
}
