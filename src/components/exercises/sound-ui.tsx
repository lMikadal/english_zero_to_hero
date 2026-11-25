"use client";
// Small pieces shared by the sound-based exercise components.
import type { ReactNode } from "react";
import { BUTTON } from "@/components/audio/AudioControls";

export const CHOICE =
  "min-h-11 w-full rounded-lg border border-zinc-300 px-4 py-2 text-left text-base " +
  "aria-checked:border-sky-600 aria-checked:bg-sky-50 data-[state=correct]:border-green-600 data-[state=correct]:bg-green-50 " +
  "data-[state=wrong]:border-red-600 data-[state=wrong]:bg-red-50 disabled:opacity-100";

export function Instruction({ th, en }: { th: string; en?: string }) {
  return (
    <header>
      <p className="text-lg font-semibold">{th}</p>
      {en && <p className="text-sm text-zinc-600">{en}</p>}
    </header>
  );
}

/** "ตรวจคำตอบ": gone once the player has graded the answer, disabled while waiting or when the answer is incomplete. */
export function CheckButton({ disabled, hidden, onClick }: { disabled: boolean; hidden: boolean; onClick(): void }) {
  if (hidden) return null;
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${BUTTON} w-full bg-sky-600 text-white disabled:bg-zinc-300 disabled:text-zinc-600`}>
      ตรวจคำตอบ
    </button>
  );
}

/** Self-rated speaking: "พูดได้" / "ยังไม่คล่อง". Neutral colours: this is not marked right or wrong. */
export function SelfRating({
  chosen, locked, onRate,
}: { chosen: "ok" | "unsure" | null; locked: boolean; onRate(rating: "ok" | "unsure"): void }): ReactNode {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={locked} aria-pressed={chosen === "ok"} onClick={() => onRate("ok")} className={`${BUTTON} aria-pressed:border-sky-600 aria-pressed:bg-sky-50`}>
        พูดได้
      </button>
      <button type="button" disabled={locked} aria-pressed={chosen === "unsure"} onClick={() => onRate("unsure")} className={`${BUTTON} aria-pressed:border-sky-600 aria-pressed:bg-sky-50`}>
        ยังไม่คล่อง
      </button>
    </div>
  );
}
