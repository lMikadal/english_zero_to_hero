import type { ReactNode } from "react";
import { MixedText } from "./MixedText";

/** The Thai instruction (and the English one when the lesson has it) at the top of every exercise. */
export function Instruction({ th, en }: { th: string; en?: string }) {
  return (
    <header className="mb-3">
      <h3 className="text-base font-semibold text-slate-900"><MixedText text={th} /></h3>
      {en ? (
        <p lang="en" className="text-sm text-slate-600">
          {en}
        </p>
      ) : null}
    </header>
  );
}

export function Prompt({ children, lang }: { children: ReactNode; lang?: "en" | "th" }) {
  return (
    <p lang={lang} className="my-3 whitespace-pre-line break-words rounded-xl bg-slate-100 p-3 text-lg text-slate-900">
      {children}
    </p>
  );
}
