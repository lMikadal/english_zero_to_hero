import type { ReactNode } from "react";

/**
 * Full-screen message with the actions pinned to the bottom (design/ui-v2 screen 27): locked day, missing lesson,
 * database error. Not for screens that carry a nav (those live under `(main)`).
 * `icon` is decorative (aria-hidden); `title` is the page's h1.
 */
export function StatusScreen({ icon, title, children, actions }: { icon?: ReactNode; title?: ReactNode; children?: ReactNode; actions: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-12">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-2 pb-10 text-center">
        {icon ? (
          <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full border border-line bg-card text-2xl">{icon}</span>
        ) : null}
        {title ? <h1 className="text-xl font-bold leading-snug text-fg">{title}</h1> : null}
        {children}
      </div>
      <div className="flex flex-col gap-2.5">{actions}</div>
    </main>
  );
}
