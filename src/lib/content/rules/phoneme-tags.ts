// Rule "phoneme-tags": in a pronunciation section that teaches more than one sound, every minimal_pair and
// repeat_after_me must say which sound(s) it practises with `phonemes`. Without it the item gets the default tag
// (the phoneme_intro's single `phoneme` code, src/lib/attempts/derive.ts), so a miss on /ð/ would be counted as a miss on
// /θ/ and the weakness tracking would point at the wrong sound.
// "More than one sound" means (the only things a machine can know): the phoneme_intro's ipa names two or more symbols
// ("/θ/ /ð/"), the section has two phoneme_intro items, or some item of the section already carries a phonemes array
// with two or more codes (a contrast such as v/w). NOT detected: a contrast pair in a section whose intro names one sound
// and where NO item is tagged (nothing tells the machine the pair contrasts two sounds); see docs/FINDINGS.md.
// ERROR: the fix is always adding the array. Items of other sections (speaking) are not checked.
import type { Problem } from "../loader";
import type { RuleContext } from "./context";
import { namedIpaSymbols } from "./pronunciation";

export const PHONEME_TAGS_RULE = "phoneme-tags";

export function checkPhonemeTags(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      if (section.skill !== "pronunciation") continue;
      const intros = section.exercises.filter((e) => e.type === "phoneme_intro");
      if (intros.length === 0) continue;
      const sounds = new Set(intros.flatMap((e) => (e.type === "phoneme_intro" ? namedIpaSymbols(e.ipa) : [])));
      const codes = new Set(section.exercises.flatMap((e) => e.phonemes ?? []));
      const intro = intros[0];
      const multiple = sounds.size > 1 || intros.length > 1 || section.exercises.some((e) => new Set(e.phonemes ?? []).size > 1);
      if (!multiple || intro.type !== "phoneme_intro") continue;
      const named = sounds.size > 0 ? [...sounds].map((s) => `/${s}/`).join(" and ") : `the sounds of ${intros.map((e) => (e.type === "phoneme_intro" ? e.phoneme : "")).join(" and ")}`;
      const known = codes.size > 0 ? ` (codes already used in this section: ${[...codes].map((c) => `"${c}"`).join(", ")})` : "";
      for (const ex of section.exercises) {
        if ((ex.type !== "minimal_pair" && ex.type !== "repeat_after_me") || ex.phonemes) continue;
        problems.push({
          rule: PHONEME_TAGS_RULE, file, id: ex.id,
          message: `this pronunciation section teaches more than one sound (${named}), but this ${ex.type} has no "phonemes", so it would be tagged only "${intro.phoneme}" (the first phoneme_intro's code) and a miss on the other sound is counted against the wrong one. Add "phonemes": [...] with the code(s) of the sound(s) it practises, the same codes as phoneme_intro.phoneme${known}.`,
        });
      }
    }
  }
  return problems;
}
