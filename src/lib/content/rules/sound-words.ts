// Rule "sound-words" (stub, tests first).
import type { Problem } from "../loader";
import type { RuleContext } from "./context";

export const SOUND_WORDS_RULE = "sound-words";
export type SoundClaim = { symbol: string; words: string[] };

export function soundClaims(_text: string): SoundClaim[] {
  return [];
}

export function checkSoundWords(_ctx: RuleContext): Problem[] {
  return [];
}
