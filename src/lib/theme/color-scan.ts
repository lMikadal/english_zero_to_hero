/**
 * Colour guard used by color-scan.test.ts (part of `make check`). Colours live only in src/app/globals.css.
 *
 * Negative direction: no raw colours (palette utilities, hex, colour functions, named colours in arbitrary values,
 * style props and SVG attributes).
 * Positive direction: the default Tailwind palette is removed, so an invented or mistyped token (`text-primary`)
 * would silently generate no CSS. Every colour-utility class must be a real token or an explicit non-colour utility.
 *
 * Known limits (cannot be made reliable without false positives): class names built from string pieces
 * (`"bg-" + x`, `bg-${x}`) and dynamic `fill={expr}` / `style={{ color: expr }}` are not seen; only literals are.
 */
const NAMED_COLORS = new Set(
  ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen").split(" "),
);
const NEUTRAL_VALUES = new Set(["currentcolor", "current", "none", "transparent", "inherit", "initial", "unset"]);

const COLOR_PREFIXES = [
  "bg", "text", "border", "border-t", "border-r", "border-b", "border-l", "border-x", "border-y", "border-s", "border-e",
  "ring", "ring-offset", "inset-ring", "outline", "fill", "stroke", "from", "via", "to", "divide", "placeholder", "decoration",
  "shadow", "inset-shadow", "drop-shadow", "text-shadow", "accent", "caret",
].sort((a, b) => b.length - a.length); // longest first: ring-offset before ring

const SIZES = "(?:2xs|xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)";
/** Explicit, per prefix: the non-colour utilities Tailwind defines (the part after `<prefix>-`). */
const NON_COLOR: Record<string, RegExp> = {
  bg: /^(?:fixed|local|scroll|clip-.+|origin-.+|no-repeat|repeat(?:-[xy]|-round|-space)?|auto|cover|contain|none|center|(?:left|right)?-?(?:top|bottom)?|(?:top|bottom|left|right)(?:-(?:top|bottom|left|right))?|blend-.+|(?:linear|radial|conic)(?:-.+)?|gradient-to-(?:t|tr|r|br|b|bl|l|tl)|size-.+|position-.+|image-.+)$/,
  text: new RegExp(`^(?:${SIZES}|base|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$`),
  border: /^(?:\d+|solid|dashed|dotted|double|hidden|none|collapse|separate|spacing(?:-[xy])?-.+|[trblxyse])$/,
  ring: /^(?:\d+|inset)$/,
  "ring-offset": /^\d+$/,
  "inset-ring": /^\d+$/,
  outline: /^(?:\d+|none|hidden|solid|dashed|dotted|double|offset-\d+)$/,
  fill: /^$/,
  stroke: /^\d+$/,
  from: /^\d+%$/,
  via: /^\d+%$/,
  to: /^\d+%$/,
  divide: /^(?:x|y|x-reverse|y-reverse|\d+|solid|dashed|dotted|double|none)$/,
  placeholder: /^$/,
  decoration: /^(?:auto|from-font|solid|double|dotted|dashed|wavy|\d+|none)$/,
  shadow: new RegExp(`^(?:${SIZES}|none|inner)$`),
  "inset-shadow": new RegExp(`^(?:${SIZES}|none)$`),
  "drop-shadow": new RegExp(`^(?:${SIZES}|none)$`),
  "text-shadow": new RegExp(`^(?:${SIZES}|none)$`),
  accent: /^auto$/,
  caret: /^$/,
};
for (const side of ["t", "r", "b", "l", "x", "y", "s", "e"]) NON_COLOR[`border-${side}`] = /^(?:\d+|solid|dashed|dotted|double|hidden|none)$/;

const RAW_PATTERNS: RegExp[] = [
  /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g, // hex literal (not &#169; or #section)
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/g, // colour functions
  // style={{ color: "red" }} and CSS-in-TS declarations with a literal value
  /\b(?:color|backgroundColor|borderColor|outlineColor|fill|stroke|caretColor|accentColor|background|border(?:Top|Right|Bottom|Left)?Color)\s*:\s*(["'`])([^"'`$]*)\1/g,
  // plain CSS declarations: color: red;
  /(?<![\w-])(?:color|background-color|background|border-color|outline-color|fill|stroke)\s*:\s*([a-zA-Z]+)\s*[;}]/g,
  // SVG attributes with a literal value: fill="red"
  /\b(?:fill|stroke)=(["'])([^"']*)\1/g,
];

function lastTopLevelColon(token: string): number {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === "[") depth++;
    else if (token[i] === "]") depth--;
    else if (token[i] === ":" && depth === 0) last = i;
  }
  return last;
}

function isColorLike(value: string): boolean {
  const v = value.replace(/^(?:color|color-mix|line):/, "").trim().toLowerCase();
  return /^#[0-9a-f]{3,8}$/.test(v) || /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/.test(v) || NAMED_COLORS.has(v);
}

function checkClassToken(raw: string, tokens: Set<string>): string | null {
  if (raw.startsWith("--") || raw.endsWith(":")) return null; // CSS custom property or declaration name
  const colon = lastTopLevelColon(raw);
  let base = colon >= 0 ? raw.slice(colon + 1) : raw; // strip variants: hover:, has-[:checked]:, md:
  base = base.replace(/^!|!$/g, "");
  base = base.replace(/\/(?:\d+|\[[^\]]*\])$/, ""); // strip /opacity
  const prefix = COLOR_PREFIXES.find((p) => base.startsWith(`${p}-`));
  if (!prefix) return null;
  const rest = base.slice(prefix.length + 1);
  if (!/^[A-Za-z0-9.%[\]#:()_,\-/]+$/.test(rest)) return null; // not a class-like token (prose, punctuation)
  if (rest.startsWith("[")) return rest.endsWith("]") && isColorLike(rest.slice(1, -1)) ? base : null; // arbitrary value
  if (tokens.has(rest) || NEUTRAL_VALUES.has(rest)) return null;
  if (NON_COLOR[prefix]?.test(rest)) return null;
  if (prefix === "bg" && rest === "") return null;
  return base;
}

/** Everything in `text` that breaks the colour rules, as short strings for the failure message. `tokens` = names from globals.css. */
export function findColorViolations(text: string, tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (const re of RAW_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const value = (m[2] ?? m[1] ?? "").trim().toLowerCase();
      // literal-valued patterns: allow neutral values, var(--token) and non-colour words
      if (m.length > 1 && m[0].match(/(?:color|background|border\w*|fill|stroke|outline\w*|caret\w*|accent\w*)\s*[:=]/i)) {
        if (value === "" || NEUTRAL_VALUES.has(value) || value.startsWith("var(")) continue;
        if (!isColorLike(value) && !/^#|^\w+\(/.test(value)) continue;
      }
      out.push(m[0]);
    }
  }
  const set = new Set(tokens);
  for (const t of text.split(/[\s"'`{}(),;$<>=]+/)) {
    if (!t) continue;
    const bad = checkClassToken(t, set);
    if (bad) out.push(bad);
  }
  return out;
}
