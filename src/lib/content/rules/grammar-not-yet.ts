// Rule "grammar-not-yet" (stub, tests first).
import type { Problem } from "../loader";
import type { RuleContext } from "./context";

export const GRAMMAR_NOT_YET_RULE = "grammar-not-yet";
export const GRAMMAR_NOT_BEFORE: Readonly<Record<string, unknown>> = {};

export function thirdPersonS(_word: string): string {
  return "";
}

export function checkGrammarNotYet(_ctx: RuleContext): Problem[] {
  return [];
}
