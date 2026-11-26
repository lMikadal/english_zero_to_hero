import type { ReactNode } from "react";

/**
 * Full-screen message with the actions pinned to the bottom (design/ui-v2 screen 27): locked day, missing lesson,
 * database error. Under the main nav (pages in `(main)`) pass `underNav`: the fixed nav floats over the bottom of the
 * screen, so the block is not full-height and the actions follow the message instead of being pinned to the bottom.
 * `icon` is decorative (aria-hidden); `title` is the page's h1.
 */
export function StatusScreen({ icon, title, children, actions, underNav = false }: { icon?: ReactNode; title?: ReactNode; children?: ReactNode; actions: ReactNode; underNav?: boolean }) {
  return (
    <main className={underNav ? "mx-auto flex max-w-md flex-col px-5 pt-12" : "mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-12"}>
      <div className={`flex flex-col items-center justify-center gap-4 px-2 pb-10 text-center ${underNav ? "" : "flex-1"}`}>
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
