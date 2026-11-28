// Client-safe and pure. UK and US spellings of the same word are ONE answer in grading (canonicalAnswer writes the UK
// form), so an author never lists "gray" next to "grey". The table is a CLOSED list of pairs plus the inflections that
// really exist; there is deliberately no suffix rule ("-our -> -or" would turn four, hour, your, flour into other words).
// Left out because the other spelling is a different word (or too risky): check/cheque, story/storey, whisky/whiskey,
// spelt/spelled, smelt/smelled, kerb/curb (curb is also a verb), and anything not listed. A test keeps traps out and
// keeps the table consistent with the vocab bank. Documented in docs/CONTENT_SCHEMA.md ("การเทียบคำตอบ", ข้อ 8).
// Risk accepted, as in every folding: practise (verb) and practice (noun) fold to one word, so a learner who types the
// US verb spelling is right, and the UK noun/verb distinction is not graded.

type Pair = readonly [uk: string, us: string];

/** noun-like: word and plural (-s). */
const n = (uk: string, us: string): Pair[] => [[uk, us], [`${uk}s`, `${us}s`]];
/** -ise / -ize verb: base, third person, past, -ing. */
const ise = (uk: string, us: string): Pair[] => {
  const k = uk.slice(0, -1), u = us.slice(0, -1);
  return [[uk, us], [`${uk}s`, `${us}s`], [`${uk}d`, `${us}d`], [`${k}ing`, `${u}ing`]];
};
/** -ll- / -l- verb: past, -ing, doer (travelled/traveled, travelling/traveling, traveller/traveler). */
const ll = (uk: string, us: string): Pair[] => [[`${uk}ed`, `${us}ed`], [`${uk}ing`, `${us}ing`], [`${uk}er`, `${us}er`], [`${uk}ers`, `${us}ers`]];

export const SPELLING_PAIRS: readonly Pair[] = [
  ...n("colour", "color"), ["coloured", "colored"], ["colouring", "coloring"], ["colourful", "colorful"],
  ...n("favourite", "favorite"), ...n("honour", "honor"), ...n("humour", "humor"), ...n("behaviour", "behavior"), ...n("flavour", "flavor"),
  ...n("labour", "labor"), ...n("harbour", "harbor"), ...n("neighbour", "neighbor"), ...n("neighbourhood", "neighborhood"),
  ...n("centre", "center"), ...n("metre", "meter"), ...n("kilometre", "kilometer"), ...n("centimetre", "centimeter"), ...n("litre", "liter"),
  ...n("theatre", "theater"), ...n("fibre", "fiber"), ...n("programme", "program"), ...n("mum", "mom"), ...n("aeroplane", "airplane"),
  ...n("defence", "defense"), ...n("catalogue", "catalog"), ...n("dialogue", "dialog"), ...n("tyre", "tire"), ...n("licence", "license"),
  ...n("doughnut", "donut"), ...n("yoghurt", "yogurt"), ["maths", "math"], ["jewellery", "jewelry"], ["pyjamas", "pajamas"],
  ["grey", "gray"], ["greyer", "grayer"], ["greyest", "grayest"], ["greyish", "grayish"], ["mould", "mold"], ["plough", "plow"],
  ...ise("organise", "organize"), ...ise("realise", "realize"), ...ise("recognise", "recognize"), ...ise("apologise", "apologize"),
  ...ise("memorise", "memorize"), ...ise("criticise", "criticize"), ...ise("summarise", "summarize"), ...ise("analyse", "analyze"),
  ["organisation", "organization"], ["organisations", "organizations"],
  ...ll("travell", "travel"), ...ll("cancell", "cancel").slice(0, 2), ...ll("labell", "label").slice(0, 2), ["modelling", "modeling"],
  ["practise", "practice"], ["practised", "practiced"], ["practising", "practicing"],
  ["learnt", "learned"], ["burnt", "burned"], ["dreamt", "dreamed"], ["ageing", "aging"],
].filter((p, i, all) => all.findIndex((q) => q[0] === p[0]) === i) as Pair[];

const TO_UK = new Map<string, string>(SPELLING_PAIRS.map(([uk, us]) => [us, uk]));
const TO_US = new Map<string, string>(SPELLING_PAIRS.map(([uk, us]) => [uk, us]));

/** The UK spelling of a whole (lower-case) token; any other token unchanged. */
export const foldSpelling = (token: string): string => TO_UK.get(token) ?? token;

/** The other spelling of a table word, in either direction (colour -> color, color -> colour); undefined when not in the table. */
export const otherSpelling = (word: string): string | undefined => TO_US.get(word) ?? TO_UK.get(word);

/** True for the UK side of a pair (colour), false for the US side (color) and for words not in the table. */
export const isUkSpelling = (word: string): boolean => TO_US.has(word);

/** Placeholder (tests first). */
export const isSenseDependent = (_word: string): boolean => false;
