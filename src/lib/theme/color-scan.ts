/**
 * Finds raw colours in source text: Tailwind palette utilities, arbitrary colour values, hex literals and colour
 * functions. Colours belong in src/app/globals.css as tokens. Used by color-scan.test.ts as `make check` guard.
 */
const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";
const UTILITY = "bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|accent|caret";

const PATTERNS: RegExp[] = [
  new RegExp(`(?<![\\w-])(?:${UTILITY})-(?:${PALETTE})(?:-\\d+)?(?![\\w-])`, "g"), // bg-card, text-fg
  /\[#[0-9a-fA-F]{3,8}\]/g, // bg-[#fff]
  /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g, // hex literal (not &#123; or #section)
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/g, // colour functions
];

export function findRawColors(text: string): string[] {
  return PATTERNS.flatMap((re) => [...text.matchAll(re)].map((m) => m[0]));
}
