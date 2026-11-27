// Rule: flashcard gloss uniqueness. The Thai->English card shows an entry's whole `th` string, so two taught entries
// that share an identical gloss item (e.g. "ดี") cannot be told apart on the card. No escape hatch: disambiguate the gloss.
import type { Problem } from "../loader";
import type { RuleContext } from "./context";

export const GLOSS_RULE = "gloss-unique";

/** Items of a gloss: split on commas (also ，), anything in parentheses ignored, trimmed, empties dropped. */
export function glossItems(th: string): string[] {
  return th
    .replace(/\([^)]*\)|（[^）]*）/g, "")
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function checkGlossUniqueness(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const owners = new Map<string, string>(); // gloss item -> first taught entry id
  const ids = [...ctx.taughtIn.entries()].sort((a, b) => a[1].day - b[1].day || a[0].localeCompare(b[0])).map(([id]) => id);
  for (const id of ids) {
    const entry = ctx.bank.get(id);
    if (!entry) continue;
    for (const item of new Set(glossItems(entry.item.th))) {
      const other = owners.get(item);
      if (other === undefined) owners.set(item, id);
      else {
        problems.push({
          rule: GLOSS_RULE, file: entry.file, id,
          message: `th "${entry.item.th}": the gloss item "${item}" is also a gloss item of ${other} ("${ctx.bank.get(other)?.item.th}"); the Thai->English flashcards cannot tell them apart. Rewrite one gloss to disambiguate it (e.g. add a distinguishing word before the comma).`,
        });
      }
    }
  }
  return problems;
}
