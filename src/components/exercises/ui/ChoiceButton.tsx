import type { ReactNode } from "react";
import { Mark } from "./Mark";
import { radioTabIndex } from "./radio";
import { toneClass, type Tone } from "./tone";

/**
 * One option of a single-choice radio group. `tone` is also `data-state`. `mark` shows the right/wrong glyph
 * (true = right, false = wrong, undefined = none). `index` / `selectedIndex` give the roving tabindex.
 * The list look has a radio dot; `center` (short two-up options such as minimal pairs, which sit on a card) has none.
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
  center?: boolean;
}) {
  const dotBorder = tone === "selected" ? "border-accent" : tone === "idle" ? "border-muted" : "border-current";
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
      className={`flex min-h-12 w-full items-center gap-2.5 border px-3.5 py-3 text-[15px] font-medium ${
        center ? "justify-center rounded-[10px] text-center" : "rounded-xl text-left"
      } ${toneClass(tone, center)}`}
    >
      {center ? null : (
        <span aria-hidden="true" className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 ${dotBorder}`}>
          {selected ? <span className={`size-2 rounded-full ${tone === "selected" ? "bg-accent" : "bg-current"}`} /> : null}
        </span>
      )}
      <span className={center ? "" : "min-w-0 flex-1 break-words"}>{children}</span>
      {mark !== undefined ? <Mark ok={mark} /> : null}
    </button>
  );
}
