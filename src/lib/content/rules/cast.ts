// Rule "cast-consistency" (stub, tests first).
import type { Problem } from "../loader";
import type { RuleContext } from "./context";

export const CAST_RULE = "cast-consistency";
export type AgeClaim = { name: string; age: number; sentence: string };

export function ageClaims(_text: string): AgeClaim[] {
  return [];
}

export function checkCast(_ctx: RuleContext): Problem[] {
  return [];
}
