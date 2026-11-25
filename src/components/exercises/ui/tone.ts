/** Visual state of an input or option. Also exposed as `data-state` so tests and styles can read it. */
export type Tone = "idle" | "selected" | "paired" | "right" | "wrong";

const BORDER: Record<Tone, string> = {
  idle: "border-slate-300 bg-white text-slate-900",
  selected: "border-sky-600 bg-sky-50 text-slate-900",
  paired: "border-slate-500 bg-slate-100 text-slate-900",
  right: "border-green-600 bg-green-50 text-green-900",
  wrong: "border-red-600 bg-red-50 text-red-900",
};

export const toneClass = (t: Tone) => BORDER[t];
export const rightWrong = (ok: boolean): Tone => (ok ? "right" : "wrong");
