// Rule "cast-props" (stub, tests first).
import type { Problem } from "../loader";
import type { RuleContext } from "./context";

export const CAST_PROPS_RULE = "cast-props";
export const COLOUR_WORDS: readonly string[] = [];
export type PropClaim = { owner: string; noun: string; colour: string; sentence: string };

export function propClaims(_text: string): PropClaim[] {
  return [];
}
export function checkCastProps(_ctx: RuleContext): Problem[] {
  return [];
}
