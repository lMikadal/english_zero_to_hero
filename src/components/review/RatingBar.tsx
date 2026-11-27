"use client";
import type { Ref } from "react";
import { RATINGS, RATING_LABEL_TH, type Rating } from "@/lib/srs/scheduler";

const TONE: Record<Rating, string> = { 1: "text-bad-fg", 2: "text-hint-fg", 3: "text-good-fg", 4: "text-accent" };

/**
 * "จำได้แค่ไหน" and the four buttons (screen 24), each with the time until the card comes back. Four in a row at 360px:
 * 320px of width, 8px gaps, so about 74px each; the label is 13px and the interval 10px, both on one line each.
 * `goodRef` is the "ได้" button: focus lands there after the reveal.
 */
export function RatingBar({ labels, onRate, goodRef }: { labels: Record<Rating, string>; onRate(r: Rating): void; goodRef?: Ref<HTMLButtonElement> }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs text-muted">จำได้แค่ไหน</p>
      <div className="grid grid-cols-4 gap-2">
        {RATINGS.map((r) => (
          <button
            key={r}
            ref={r === 3 ? goodRef : undefined}
            type="button"
            onClick={() => onRate(r)}
            // the focus lands here inside the keydown that revealed the card: a held key repeats onto this button and must not rate
            onKeyDown={(e) => { if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault(); }}
            className="flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl border border-line bg-surface px-1 py-2.5 text-center"
          >
            <span className={`text-[13px] font-bold leading-snug ${TONE[r]}`}>{RATING_LABEL_TH[r]}</span>{" "}
            <span className="text-[10px] leading-snug text-muted">{labels[r]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
