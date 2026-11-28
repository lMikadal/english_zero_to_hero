// UK / US spelling table (stub, tests first).
export const SPELLING_PAIRS: readonly (readonly [uk: string, us: string])[] = [];
export const foldSpelling = (t: string): string => t;
export const otherSpelling = (_w: string): string | undefined => undefined;
