import type { ReactNode } from "react";
import { Mark } from "./Mark";
import { radioTabIndex } from "./radio";
import { toneClass, type Tone } from "./tone";

/**
 * One option of a single-choice radio group. `tone` is also `data-state`. `mark` shows the right/wrong glyph
 * (true = right, false = wrong, undefined = none). `index` / `selectedIndex` give the roving tabindex.
 */
export function ChoiceButton({
  children, index, selectedIndex, selected, tone, mark, disabled, onClick, center = false,
}: {
  children: ReactNode;
  index: number;
  selectedIndex: number | null;
  selected: boolean;
  tone: Tone;
  mark?: boolean;
  disabled: boolean;
  onClick(): void;
  /** Centre the label (short two-up options such as minimal pairs). */
  center?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      lang="en"
      tabIndex={radioTabIndex(selectedIndex, index)}
      aria-checked={selected}
      data-state={tone}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 w-full rounded-xl border-2 px-3 py-2 ${center ? "text-center" : "text-left"} text-base ${toneClass(tone)}`}
    >
      {children}
      {mark !== undefined ? <span className="ml-2"><Mark ok={mark} /></span> : null}
    </button>
  );
}
