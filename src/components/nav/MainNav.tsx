"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isCurrent, type NavIcon } from "./items";

const PATHS: Record<NavIcon, React.ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />,
  practice: <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />,
  progress: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5V12h8.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
};

function Icon({ name, className }: { name: NavIcon; className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}

/**
 * Floating capsule bar. The current menu is a raised accent circle with no visible label (its name stays for screen
 * readers) and the bar's top edge dips around it: `.nav-notch` (globals.css) masks the bar background with a circle
 * centred at --cx, the middle of the current menu's column. Cells are equal width, so --cx follows from the index.
 * The mask also removes the bar's 1px border there, so `.nav-ring` (a second layer with the same --cx) paints the
 * outline back as a thin circular band that follows the notch and meets the bar's top border at both ends.
 */
export function MainNav() {
  const pathname = usePathname();
  const active = NAV_ITEMS.findIndex((i) => isCurrent(i.href, pathname));
  const n = NAV_ITEMS.length;
  const cx = `calc(0.5rem + (100% - 1rem) * ${(Math.max(active, 0) + 0.5) / n})`;
  const style = { ["--cx" as string]: cx };
  return (
    <nav aria-label="เมนูหลัก" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="relative mx-auto h-16 max-w-md">
        <div aria-hidden="true" className={`absolute inset-0 rounded-3xl border border-line bg-surface ${active >= 0 ? "nav-notch" : ""}`} style={style} />
        {active >= 0 && <div aria-hidden="true" className="nav-ring pointer-events-none absolute inset-0 rounded-3xl" style={style} />}
        <ul className="pointer-events-auto relative m-0 grid h-full list-none grid-cols-4 p-0 px-2">
          {NAV_ITEMS.map((item, i) => {
            const current = i === active;
            return (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className="relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 text-muted"
                >
                  {current ? (
                    <>
                      <span aria-hidden="true" className="absolute -top-[23px] left-1/2 flex size-[54px] -translate-x-1/2 items-center justify-center rounded-full bg-accent text-on-accent">
                        <Icon name={item.icon} className="size-6" />
                      </span>
                      <span className="sr-only">{item.label}</span>
                    </>
                  ) : (
                    <>
                      <Icon name={item.icon} className="size-5" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
