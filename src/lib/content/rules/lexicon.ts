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

function regularForms(base: string, pos: string): string[] {
  if (!/^(noun|verb|adjective|auxiliary verb)$/.test(pos)) return [];
  const forms = [`${base}s`, `${base}es`];
  if (/[^aeiou]y$/.test(base)) forms.push(`${base.slice(0, -1)}ies`, `${base.slice(0, -1)}ied`);
  if (pos !== "noun" && pos !== "adjective") {
    const stem = base.endsWith("e") ? base.slice(0, -1) : base;
    forms.push(`${stem}ing`, `${base}ing`, `${stem}ed`, `${base}ed`, `${base}d`);
    if (/[^aeiou][aeiou][^aeiouwy]$/.test(base)) forms.push(`${base}${base.slice(-1)}ing`, `${base}${base.slice(-1)}ed`);
  }
  return forms;
}

/** The headword split into words ("wake up" -> wake, up). */
const parts = (item: VocabItem) => item.word.toLowerCase().split(/\s+/).filter(Boolean);

/** Values of `forms`, split on "/" and spaces ("am / is / are"). */
const listedForms = (item: VocabItem) => Object.values(item.forms ?? {}).flatMap((v) => v.toLowerCase().split(/[\s/]+/)).filter(Boolean);

/** Every word shape that counts as the entry: headword parts, listed forms and the regular inflections of the headword. */
export function surfaceForms(item: VocabItem): Set<string> {
  const out = new Set<string>([...parts(item), ...listedForms(item)]);
  const ps = parts(item);
  for (const f of regularForms(ps[ps.length - 1] ?? "", item.pos)) out.add(f);
  if (item.word.toLowerCase() === "be") out.add("being");
  return out;
}

/** Forms whose appearance counts as "using" the entry: the first word's forms, listed forms and its regular inflections. */
export function usageForms(item: VocabItem): Set<string> {
  const head = parts(item)[0] ?? "";
  const ps = parts(item);
  const out = new Set<string>([head, ...listedForms(item)]);
  for (const f of regularForms(ps.length === 1 ? head : ps[ps.length - 1], item.pos)) out.add(f);
  return out;
}
