// Shared by touch-targets.test.tsx and component tests: finds interactive elements without a 44px minimum-height class.
const INTERACTIVE = "button, a, input, textarea, [role=radio]";
/** Elements sized another way (none today). Add a selector here only with a reason. */
const ALLOW: string[] = [];
/** h-11 (44px) or taller, min- or fixed. */
const TALL_ENOUGH = /(^|\s)(min-)?h-(1[1-9]|[2-9]\d)(\s|$)/;

export function smallTargets(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll(INTERACTIVE))
    .filter((el) => !ALLOW.some((s) => el.matches(s)))
    .filter((el) => !TALL_ENOUGH.test(el.getAttribute("class") ?? ""))
    .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}"> ${(el.textContent ?? "").trim().slice(0, 20)}`);
}
