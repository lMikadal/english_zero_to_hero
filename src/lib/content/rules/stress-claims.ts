// Rule "stress-claims" (WARNING): a pronunciation instruction or tip that marks stress with capitals inside a word ("WEEKend",
// "weekEND", "baNAna", "thirTEEN") must agree with the PRIMARY stress mark (ˈ) of that word's vocab IPA in at least one accent, and when
// the US and UK IPA stress different syllables the text must mention both (incident: weekend, US /ˈwiːkend/, UK /ˌwiːkˈend/).
// Only a word with a vocab entry is checked. A claim is read from a Latin word that has lower-case letters and capitals that are not
// just a first capital; the stressed syllable is counted as the number of vowel groups before the first capital ("baNAna" = 1), a
// trailing silent e of that prefix is not a syllable ("makeUP" = 1). Approximate on purpose, hence a warning.
import type { Problem } from "../loader";
import type { RuleContext } from "./context";
import { ipaTokens } from "./pronunciation";

export const STRESS_CLAIMS_RULE = "stress-claims";

const VOWEL = /^[aeiouæɑɒɔəɛɜɪʊʌɐɚɝ]/;

/** The words of `text` that mark stress with capitals, with the 0-based index of the stressed syllable. */
export function stressClaims(text: string): { word: string; index: number; written: string }[] {
  const out: { word: string; index: number; written: string }[] = [];
  for (const m of text.matchAll(/[A-Za-z]+/g)) {
    const w = m[0];
    const firstUpper = w.search(/[A-Z]/);
    if (firstUpper < 0 || !/[a-z]/.test(w)) continue; // no capital, or an abbreviation (TV, OK)
    if (firstUpper === 0 && !/[A-Z]/.test(w.slice(1))) continue; // an ordinary first capital (Sam)
    let prefix = w.slice(0, firstUpper).toLowerCase();
    let index = (prefix.match(/[aeiouy]+/g) ?? []).length;
    if (/[^aeiouy]e$/.test(prefix) && prefix.length > 2) index -= 1; // silent final e
    out.push({ word: w.toLowerCase(), index: Math.max(0, index), written: w });
    prefix = "";
  }
  return out;
}

/** 0-based index of the syllable that holds the primary stress mark of an IPA transcription; undefined without a ˈ (one syllable). */
export function primaryStressIndex(ipa: string): number | undefined {
  const at = ipa.indexOf("ˈ");
  if (at < 0) return undefined;
  return ipaTokens(ipa.slice(0, at)).filter((t) => VOWEL.test(t)).length;
}

export function checkStressClaims(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const byWord = new Map<string, { us: string; uk: string }[]>();
  for (const { item } of ctx.bank.values()) byWord.set(item.word.toLowerCase(), [...(byWord.get(item.word.toLowerCase()) ?? []), item.ipa]);
  for (const { file, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        const texts = [ex.instruction.th, ex.instruction.en ?? "", ex.type === "phoneme_intro" ? ex.tipTh : ""].filter(Boolean);
        for (const text of texts) {
          const claims = stressClaims(text);
          const words = [...new Set(claims.map((c) => c.word))];
          for (const word of words) {
            const entries = byWord.get(word);
            if (!entries) continue;
            const us = entries.map((e) => primaryStressIndex(e.us)).find((i) => i !== undefined);
            const uk = entries.map((e) => primaryStressIndex(e.uk)).find((i) => i !== undefined);
            if (us === undefined && uk === undefined) continue;
            const mine = claims.filter((c) => c.word === word);
            const ipa = `US IPA ${entries[0].us}, UK IPA ${entries[0].uk}`;
            for (const c of mine) {
              if (c.index === us || c.index === uk) continue;
              problems.push({
                rule: STRESS_CLAIMS_RULE, file, id: ex.id, severity: "warning",
                message: `"${text}" says "${c.written}" (stress on syllable ${c.index + 1}) but "${word}" has neither: ${ipa} (primary stress mark ˈ). Fix the capitals to match the IPA of the vocab entry.`,
              });
            }
            if (us !== undefined && uk !== undefined && us !== uk && !(mine.some((c) => c.index === us) && mine.some((c) => c.index === uk))) {
              if (mine.every((c) => c.index === us || c.index === uk)) {
                problems.push({
                  rule: STRESS_CLAIMS_RULE, file, id: ex.id, severity: "warning",
                  message: `"${text}" marks the stress of "${word}" as "${mine[0].written}" but the accents differ: the US IPA ${entries[0].us} stresses syllable ${us + 1} and the UK IPA ${entries[0].uk} stresses syllable ${uk + 1}. Mention both patterns in the instruction (write the other one with its capitals too), as the vocab entry has both.`,
                });
              }
            }
          }
        }
      }
    }
  }
  return problems;
}
