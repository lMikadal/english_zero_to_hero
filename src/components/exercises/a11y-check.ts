// Shared by a11y-guard.test.tsx and the screen tests: the two language checks (pure DOM reads).

/** Text with Latin letters that is not under an element with lang="en*". */
export function missingLangEn(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").trim();
    if (!/[A-Za-z]/.test(text)) continue;
    const lang = n.parentElement?.closest("[lang]")?.getAttribute("lang") ?? "";
    if (!lang.startsWith("en")) out.push(text);
  }
  return out;
}

/** Thai text that sits under an element with lang="en*" (a screen reader would read it with an English voice). */
export function thaiUnderEn(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").trim();
    if (!/[\u0E00-\u0E7F]/.test(text)) continue;
    const lang = n.parentElement?.closest("[lang]")?.getAttribute("lang") ?? "";
    if (lang.startsWith("en")) out.push(text);
  }
  return out;
}
