// The one radio-group pattern for single-choice options (listen_choose, minimal_pair, read_passage):
// roving tabindex plus arrow keys, as in a native radio group.
import type { KeyboardEvent } from "react";

/** Roving tabindex: the chosen radio (or the first when none) is the one in the tab order. */
export const radioTabIndex = (selected: number | null, i: number): 0 | -1 => ((selected ?? 0) === i ? 0 : -1);

/** Arrow keys move to the next/previous radio (wrapping) and select it. */
export function radioKeys(e: KeyboardEvent<HTMLElement>, count: number, current: number | null, select: (i: number) => void) {
  const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
  if (d === 0) return;
  e.preventDefault();
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const focused = radios.findIndex((r) => r === document.activeElement);
  const from = focused >= 0 ? focused : (current ?? (d > 0 ? -1 : 0));
  const next = (((from + d) % count) + count) % count;
  select(next);
  radios[next]?.focus();
}
