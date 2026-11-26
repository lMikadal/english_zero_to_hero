import type { ReactNode } from "react";
import { toneClass, type Tone } from "./tone";

/** A word tile (arrange_words): 10px radius, 16px medium text, 44px tall. */
export function Tile({ tone, disabled, onClick, children }: { tone: Tone; disabled: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 min-w-11 rounded-[10px] border px-3.5 py-2 text-base font-medium disabled:cursor-default ${toneClass(tone)}`}
    >
      {children}
    </button>
  );
}
