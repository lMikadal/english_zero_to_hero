import type { ElementType, HTMLAttributes, ReactNode } from "react";

/**
 * The card surface of the exercise screens (design/ui-v2): card background, 1px line border, 14px radius.
 * `tone` is also `data-state`; right / wrong only tint the border here (the answer glyph and sr-only text come from <Mark>).
 */
export type CardTone = "idle" | "right" | "wrong";
const BORDER: Record<CardTone, string> = { idle: "border-line", right: "border-good/40", wrong: "border-bad/40" };

export function Card({
  tone = "idle", pad = "p-4", className = "", children, ...rest
}: { tone?: CardTone; pad?: string; className?: string; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-state={tone} className={`rounded-[14px] border bg-card ${BORDER[tone]} ${pad} ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** A card of rows separated by hairlines (examples, shadowing lines, glossary). */
export function CardList({
  as: Tag = "ul", className = "", children, ...rest
}: { as?: "ul" | "ol"; className?: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const T = Tag as ElementType;
  return (
    <T className={`divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card ${className}`} {...rest}>
      {children}
    </T>
  );
}
