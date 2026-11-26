/** Visual state of an input or option. Also exposed as `data-state` so tests and styles can read it. */
export type Tone = "idle" | "selected" | "paired" | "right" | "wrong";

// Border width is set by the component (1px); `selected` adds a 1px ring so it reads as 2px without shifting the layout.
const BORDER: Record<Tone, string> = {
  idle: "border-line bg-card text-fg",
  selected: "border-accent bg-surface text-fg ring-1 ring-accent",
  paired: "border-muted bg-surface text-fg",
  right: "border-good bg-good-soft text-good-fg",
  wrong: "border-bad bg-bad-soft text-bad-fg",
};

/** `onCard`: the element sits on a card, so its idle fill is the one-step-up `surface` (design: choices inside a pair card). */
export const toneClass = (t: Tone, onCard = false) => (onCard && t === "idle" ? "border-line bg-surface text-fg" : BORDER[t]);
export const rightWrong = (ok: boolean): Tone => (ok ? "right" : "wrong");

/** Like toneClass, for text inputs and textareas only: the idle border is the 3:1 `control` token, not the subtle `line`. */
export const fieldToneClass = (t: Tone) => (t === "idle" ? "border-control bg-surface text-fg" : BORDER[t]);

/** Shared size of text inputs (design: 12px radius, 16px text, 48px tall). */
export const FIELD = "min-h-12 w-full rounded-xl border px-3.5 py-2 text-base";
