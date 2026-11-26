// The one set of button looks (design/ui-v2: 12px radius, 15px medium text, at least 48px tall). Used by the player,
// the exercise "ตรวจคำตอบ" button, the completion / locked-day / error screens. A new screen takes its buttons from here.
export type ButtonKind = "primary" | "secondary" | "quiet";

const BASE = "flex min-h-12 w-full items-center justify-center rounded-xl border px-4 py-3 text-center text-[15px] font-medium disabled:cursor-default";

const KIND: Record<ButtonKind, string> = {
  primary: "border-transparent bg-accent text-on-accent disabled:bg-surface disabled:text-muted",
  secondary: "border-line text-fg",
  quiet: "border-line bg-surface text-fg",
};

export const buttonClass = (kind: ButtonKind, extra = ""): string => `${BASE} ${KIND[kind]}${extra ? ` ${extra}` : ""}`;

/** Small pill for audio ("ฟัง", "ฟังช้า 0.75×", "ข้าม"). 44px minimum height for touch; the design's chip is smaller. */
export const CHIP =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-fg active:bg-card disabled:opacity-50";
