// Rule: flashcard gloss uniqueness. The Thai->English card shows an entry's whole `th` string, so what the learner SEES
// decides: two taught entries that share an identical gloss item INCLUDING its parenthetical qualifier cannot be told
// apart on the card (error, no escape hatch: disambiguate the gloss). Items that are identical only once the qualifiers
// are removed ("ไม่ (คำตอบ)" / "ไม่ (วางหลัง is)") are different cards but a near-clash: reported as a warning.
import type { Problem } from "../loader";
import type { RuleContext } from "./context";

export const GLOSS_RULE = "gloss-unique";

const clean = (s: string) => s.normalize("NFC").replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();

/** Items of a gloss: split on commas (also ，) outside parentheses; qualifiers kept; NFC, one-space, no zero-width. */
export function glossItems(th: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of clean(th)) {
    if (ch === "(" || ch === "（") depth++;
    if ((ch === ")" || ch === "）") && depth > 0) depth--;
    if ((ch === "," || ch === "，") && depth === 0) {
      items.push(cur);
      cur = "";
    } else cur += ch;
  }
  items.push(cur);
  return items.map(clean).filter(Boolean);
}

/** An item without any (nested) parenthetical qualifier. */
export function glossBase(item: string): string {
  let depth = 0;
  let out = "";
  for (const ch of item) {
    if (ch === "(" || ch === "（") depth++;
    else if ((ch === ")" || ch === "）") && depth > 0) depth--;
    else if (depth === 0) out += ch;
  }
  return clean(out);
}

export function checkGlossUniqueness(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const exact = new Map<string, string>(); // gloss item as shown -> first taught entry id
  const base = new Map<string, string>(); // item without qualifier -> first entry id
  const ids = [...ctx.taughtIn.entries()].sort((a, b) => a[1].day - b[1].day || a[0].localeCompare(b[0])).map(([id]) => id);
  for (const id of ids) {
    const entry = ctx.bank.get(id);
    if (!entry) continue;
    const seenBase = new Set<string>();
    for (const item of new Set(glossItems(entry.item.th))) {
      const other = exact.get(item);
      if (other === undefined) exact.set(item, id);
      else {
        problems.push({
          rule: GLOSS_RULE, file: entry.file, id,
          message: `th "${entry.item.th}": the gloss item "${item}" is also a gloss item of ${other} ("${ctx.bank.get(other)?.item.th}"); the Thai->English flashcards cannot tell them apart. Rewrite one gloss to disambiguate it (e.g. add a qualifier in parentheses or a distinguishing word).`,
        });
        continue;
      }
      const b = glossBase(item);
      const nearOther = base.get(b);
      if (nearOther === undefined) base.set(b, id);
      else if (nearOther !== id && !seenBase.has(b)) {
        problems.push({
          rule: GLOSS_RULE, severity: "warning", file: entry.file, id,
          message: `near-clash: the gloss item "${item}" matches "${b}" in ${nearOther} ("${ctx.bank.get(nearOther)?.item.th}") once the parenthetical qualifiers are removed. The cards differ only by their qualifier; check that a learner can still tell them apart.`,
        });
      }
      seenBase.add(b);
    }
  }
  return problems;
}
