// Small deterministic English word handling for the content rules: tokens and the surface forms of a taught word.
// Deliberately simple: regular -s/-es/-ies/-ing/-ed plus the forms listed in the vocab entry. No stemmer, no dictionary.
import { CONTRACTIONS } from "@/lib/answers/equivalents";
import type { VocabItem } from "../schema";

const CONTRACTED = new Map<string, string[]>(CONTRACTIONS.map(([c, full]) => [c, full.split(" ")]));

/**
 * Lower-case word tokens of learner-facing English. Contractions become their words (I'm -> i am), a possessive 's
 * is dropped (Sam's -> sam), hyphens split (B-U-S -> b u s), digits and punctuation are ignored.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().replace(/[’‘ʼ´`]/g, "'").match(/[a-z]+(?:'[a-z]+)*/g) ?? []) {
    const expanded = CONTRACTED.get(raw);
    if (expanded) out.push(...expanded);
    else if (/^[a-z]+'s$/.test(raw)) out.push(raw.slice(0, -2));
    else out.push(raw);
  }
  return out;
}

/** Verbs whose last consonant doubles before -ing/-ed (a tiny explicit list; other verbs list the form in `forms`). */
const DOUBLING = new Set(["sit", "stop", "plan", "run", "get", "put", "swim", "begin", "shop", "drop", "chat", "clap"]);

/**
 * Regular inflections of one word. Only what English spelling rules give, nothing that makes another word:
 * -es only after s/x/z/ch/sh/o, y->ies, -ing/-ed with e-drop, doubling only for DOUBLING. The entry's own
 * `forms` win: a noun that lists its plural gets no -s, a verb that lists its past gets no -ed.
 */
function regularForms(base: string, item: VocabItem): string[] {
  const pos = item.pos;
  const listed = item.forms ?? {};
  const out: string[] = [];
  const isVerb = pos === "verb" || pos === "auxiliary verb";
  if (pos === "noun" || isVerb) {
    if (!(pos === "noun" && listed.plural) && !listed.present) {
      if (/[^aeiou]y$/.test(base)) out.push(`${base.slice(0, -1)}ies`);
      else if (/(s|x|z|ch|sh|o)$/.test(base)) out.push(`${base}es`);
      else out.push(`${base}s`);
    }
  }
  if (isVerb) {
    const eDrop = /e$/.test(base) && !/(ee|ye|oe)$/.test(base) && base.length > 2;
    const stem = eDrop ? base.slice(0, -1) : base;
    out.push(`${stem}ing`);
    if (DOUBLING.has(base)) out.push(`${base}${base.slice(-1)}ing`);
    if (!listed.past && !listed.pastParticiple && base.length > 2) {
      if (/[^aeiou]y$/.test(base)) out.push(`${base.slice(0, -1)}ied`);
      else if (/e$/.test(base)) out.push(`${base}d`);
      else out.push(`${base}ed`);
      if (DOUBLING.has(base)) out.push(`${base}${base.slice(-1)}ed`);
    }
  }
  return out;
}

const words = (item: VocabItem) => item.word.toLowerCase().split(/\s+/).filter(Boolean);

/** Each listed form ("am / is / are", "woke up") as separate alternatives. */
const listedAlternatives = (item: VocabItem) => Object.values(item.forms ?? {}).flatMap((v) => v.toLowerCase().split("/").map((x) => x.trim()).filter(Boolean));

/** The word of a multi-word headword that inflects: the first for a verb (wake up), the last otherwise (ice cream). */
function headIndex(item: VocabItem): number {
  const n = words(item).length;
  return item.pos === "verb" && n > 1 ? 0 : n - 1;
}

/** Every word shape that counts as the entry: headword words, listed forms and the regular inflections of the head word. */
export function surfaceForms(item: VocabItem): Set<string> {
  const ps = words(item);
  const out = new Set<string>([...ps, ...listedAlternatives(item).flatMap((a) => a.split(/\s+/))]);
  for (const f of regularForms(ps[headIndex(item)] ?? "", item)) out.add(f);
  if (item.word.toLowerCase() === "be") out.add("being");
  return out;
}

/**
 * Forms whose appearance counts as "using" the entry: the head word and its forms (so "wake up" is used by "wakes"
 * or "woke", never by the bare particle "up"). A single word counts by every surface form.
 */
export function usageForms(item: VocabItem): Set<string> {
  const ps = words(item);
  if (ps.length <= 1) return surfaceForms(item);
  const h = headIndex(item);
  const out = new Set<string>([ps[h], ...listedAlternatives(item).map((a) => a.split(/\s+/)[h] ?? a.split(/\s+/)[0])]);
  for (const f of regularForms(ps[h], item)) out.add(f);
  return out;
}
