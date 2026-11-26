import type { ReactNode } from "react";
import { MixedText } from "./MixedText";

/** The Thai instruction (and the English one when the lesson has it) at the top of every exercise: 17px bold. */
export function Instruction({ th, en }: { th: string; en?: string }) {
  return (
    <header>
      <h3 className="text-[17px] font-bold leading-snug text-fg"><MixedText text={th} /></h3>
      {en ? (
        <p lang="en" className="mt-0.5 text-[13px] text-muted">
          {en}
        </p>
      ) : null}
    </header>
  );
}

/** A sentence to translate or answer, on a card. Thai prompts are 20px medium; English prompts 20px bold. */
export function Prompt({ children, lang }: { children: ReactNode; lang?: "en" | "th" }) {
  return (
    <p lang={lang} className="whitespace-pre-line break-words rounded-[14px] border border-line bg-card p-4 text-xl font-medium text-fg">
      {children}
    </p>
  );
}
