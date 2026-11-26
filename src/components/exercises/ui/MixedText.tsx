import { Fragment } from "react";

// Thai text that quotes English words ("เช่น sit กับ seat") needs lang="en" on the English runs so screen readers
// switch voice. A run is Latin words joined by one space, hyphen, dash or slash.
const RUN = /[A-Za-z][A-Za-z0-9'’]*(?:[ \-–/][A-Za-z][A-Za-z0-9'’]*)*/g;

export function MixedText({ text }: { text: string }) {
  const out: (string | { en: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(RUN)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ en: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return (
    <>
      {out.map((part, i) =>
        typeof part === "string" ? <Fragment key={i}>{part}</Fragment> : <span key={i} lang="en">{part.en}</span>,
      )}
    </>
  );
}
