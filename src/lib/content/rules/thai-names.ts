// Rule "thai-names" (stub, tests first).
import type { Problem } from "../loader";
import type { RuleContext } from "./context";

export const THAI_NAMES_RULE = "thai-names";
export function thaiNameMismatches(_text: string, _forms: Readonly<Record<string, string>>): { found: string; name: string }[] {
  return [];
}
export function checkThaiNames(_ctx: RuleContext, _table?: Readonly<Record<string, string>>): Problem[] {
  return [];
}
