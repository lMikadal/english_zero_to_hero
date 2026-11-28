import type { ReactNode, Ref } from "react";

/**
 * The frame every player step sits in: the header (section title, "ข้อ x / n", progress bar), the step itself and the sticky
 * bottom bar. Shared by the lesson player and the checkpoint player so the two cannot drift apart. It holds no state and
 * knows nothing about answers: the player decides what the bar shows (`bar`) and whether it looks "answered" (`answered`).
 */
export function PlayerFrame({
  headingRef, title, x, total, badge, note, answered, bar, children,
}: {
  headingRef: Ref<HTMLHeadingElement>;
  /** Section title in Thai. */
  title: string;
  x: number;
  total: number;
  /** Pill above the heading (the replay mode label). */
  badge?: ReactNode;
  /** One line under the progress bar (the retry round label). */
  note?: ReactNode;
  /** The step has a recorded answer: the bar becomes a card-coloured panel with a top border. */
  answered: boolean;
  bar: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-4">
      <header className="flex flex-col gap-2.5">
        {badge}
        <h2 ref={headingRef} tabIndex={-1} className="flex items-center justify-between text-[13px] font-normal text-muted outline-none">
          <span className="font-medium">{title}</span>
          <span>ข้อ {x} / {total}</span>
        </h2>
        <div className="h-1 rounded-full bg-line" aria-hidden>
          <div className="h-1 rounded-full bg-accent" style={{ width: `${(x / total) * 100}%` }} />
        </div>
        {note}
      </header>

      {children}

      {/* Sticky bottom bar: the feedback and ถัดไป stay on screen however long the exercise is. mt-auto keeps it at
          the bottom of a short page. Only one primary action is shown at a time (guard: LessonPlayer.one-action.test.tsx). */}
      <div
        data-testid="action-bar"
        className={`sticky bottom-0 mt-auto -mx-5 flex flex-col gap-3 px-5 ${
          answered ? "border-t border-line bg-card pt-3.5" : "bg-bg"
        } pb-[max(1.5rem,env(safe-area-inset-bottom))]`}
      >
        {bar}
      </div>
    </main>
  );
}
