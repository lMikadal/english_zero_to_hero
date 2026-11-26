"use client";

import { useState } from "react";
import { THEMES, applyTheme, type Theme } from "@/lib/theme/theme";

const LABEL: Record<Theme, string> = { light: "สว่าง", dark: "มืด", system: "ตามเครื่อง" };

/** Three-way theme choice. Applies at once (<html data-theme>) and remembers it per device in a cookie. */
export function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-base text-muted">ธีม</legend>
      <div role="radiogroup" aria-label="ธีม" className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface p-1">
        {THEMES.map((t) => (
          <label
            key={t}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-2 text-center text-base font-medium has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
          >
            <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => choose(t)} className="sr-only" />
            {LABEL[t]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
