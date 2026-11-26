import type { FormEvent, ReactNode } from "react";

/**
 * Root of every exercise: a column that fills the step, so the "ตรวจคำตอบ" button (mt-auto) sits at the bottom of a
 * short screen as in the design. With `onSubmit` it is a <form> (Enter submits) and the reload is prevented here.
 */
export function ExerciseShell({ children, onSubmit }: { children: ReactNode; onSubmit?: () => void }) {
  const cls = "flex flex-1 flex-col gap-4";
  if (!onSubmit) return <section className={cls}>{children}</section>;
  return (
    <form className={cls} onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}>
      {children}
    </form>
  );
}
