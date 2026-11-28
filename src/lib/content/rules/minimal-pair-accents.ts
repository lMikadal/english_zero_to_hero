// Rule "minimal-pair-accents" (WARNING): a minimal_pair whose two words both have a vocab entry must differ by exactly ONE sound
// (one substitution, insertion or deletion of a phoneme) in the US IPA AND in the UK IPA of the bank. Incident: fast-fat is /fæst/-/fæt/
// in US English but /fɑːst/-/fæt/ in UK English. Phonemes are the tokens of `ipaTokens` (tʃ, aɪ, iː count once; stress marks and the
// optional UK "(r)" are not sounds). A word with no entry is skipped silently (most drill words are untaught on purpose; the
// word-blocklist rule covers the worst of them). A warning, not an error: it is only as exact as the IPA of the bank.
import type { Problem } from "../loader";
import type { RuleContext } from "./context";
import { ipaTokens } from "./pronunciation";

export const MINIMAL_PAIR_ACCENTS_RULE = "minimal-pair-accents";

function distance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const VOWEL = /^[aeiouæɑɒɔəɛɜɪʊʌɐ]/;
/** Sounds of an IPA string: whole phonemes; an r that follows a vowel and is not followed by one makes an r-coloured vowel (US ɜːr, ɑːr), which is ONE sound. */
function sounds(ipa: string): string[] {
  const t = ipaTokens(ipa.replace(/\(r\)/g, ""));
  const out: string[] = [];
  t.forEach((tok, i) => {
    if (tok === "r" && out.length > 0 && VOWEL.test(out[out.length - 1]) && !(t[i + 1] && VOWEL.test(t[i + 1]))) out[out.length - 1] += "r";
    else out.push(tok);
  });
  return out;
}

export function checkMinimalPairAccents(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const byWord = new Map<string, { us: string; uk: string }[]>();
  for (const { item } of ctx.bank.values()) byWord.set(item.word.toLowerCase(), [...(byWord.get(item.word.toLowerCase()) ?? []), item.ipa]);
  for (const { file, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        if (ex.type !== "minimal_pair") continue;
        ex.pairs.forEach((p, n) => {
          const a = byWord.get(p.a.trim().toLowerCase());
          const b = byWord.get(p.b.trim().toLowerCase());
          if (!a || !b) return;
          const bad: string[] = [];
          for (const accent of ["us", "uk"] as const) {
            const dists = a.flatMap((x) => b.map((y) => distance(sounds(x[accent]), sounds(y[accent]))));
            if (dists.includes(1)) continue;
            bad.push(`differ by ${dists[0]} sound${dists[0] === 1 ? "" : "s"} in the ${accent.toUpperCase()} IPA (${a[0][accent]} vs ${b[0][accent]})`);
          }
          if (bad.length === 0) return;
          problems.push({
            rule: MINIMAL_PAIR_ACCENTS_RULE, file, id: ex.id, severity: "warning",
            message: `pairs[${n}]: "${p.a}" and "${p.b}" ${bad.join(" and ")}, not by exactly one sound, so they are not a minimal pair in both accents. Choose a pair that differs by exactly one sound in the US and the UK IPA (for example "west" and "wet").`,
          });
        });
      }
    }
  }
  return problems;
}
