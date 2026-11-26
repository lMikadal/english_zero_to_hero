/** Visual state of an input or option. Also exposed as `data-state` so tests and styles can read it. */
export type Tone = "idle" | "selected" | "paired" | "right" | "wrong";

const BORDER: Record<Tone, string> = {
  idle: "border-line bg-card text-fg",
  selected: "border-accent bg-surface text-fg",
  paired: "border-muted bg-surface text-fg",
  right: "border-good bg-good-soft text-good-fg",
  wrong: "border-bad bg-bad-soft text-bad-fg",
};

export const toneClass = (t: Tone) => BORDER[t];
export const rightWrong = (ok: boolean): Tone => (ok ? "right" : "wrong");
