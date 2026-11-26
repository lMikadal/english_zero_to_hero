/**
 * Self-rated speaking: "พูดได้" / "ยังไม่คล่อง". Never styled right or wrong: it is not graded.
 * "พูดได้" is the accent (primary) button and "ยังไม่คล่อง" the outlined one, as in the design; the chosen one gets a ring.
 * mt-auto puts the pair at the bottom of the step.
 */
import { buttonClass } from "@/components/ui/button-styles";

export function SelfRating({
  chosen, locked, onRate,
}: { chosen: "ok" | "unsure" | null; locked: boolean; onRate(rating: "ok" | "unsure"): void }) {
  const button = (r: "ok" | "unsure", label: string) => (
    <button
      type="button"
      disabled={locked}
      aria-pressed={chosen === r}
      onClick={() => onRate(r)}
      className={`${buttonClass(r === "ok" ? "primary" : "secondary", "flex-1 disabled:opacity-60")} ${chosen === r ? "opacity-100 ring-2 ring-ring ring-offset-2 ring-offset-bg disabled:opacity-100" : ""}`}
    >
      {label}
    </button>
  );
  return (
    <div className="mt-auto flex gap-2.5">
      {button("ok", "พูดได้")}
      {button("unsure", "ยังไม่คล่อง")}
    </div>
  );
}
