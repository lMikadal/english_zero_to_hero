import { toneClass } from "./tone";

/** Self-rated speaking: "พูดได้" / "ยังไม่คล่อง". Never styled right or wrong: it is not graded. */
export function SelfRating({
  chosen, locked, onRate,
}: { chosen: "ok" | "unsure" | null; locked: boolean; onRate(rating: "ok" | "unsure"): void }) {
  const button = (r: "ok" | "unsure", label: string) => (
    <button
      type="button"
      disabled={locked}
      aria-pressed={chosen === r}
      onClick={() => onRate(r)}
      className={`min-h-12 flex-1 rounded-xl border-2 px-3 text-base font-semibold disabled:opacity-80 ${toneClass(chosen === r ? "selected" : "idle")}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-3">
      {button("ok", "พูดได้")}
      {button("unsure", "ยังไม่คล่อง")}
    </div>
  );
}
