// Rule "strict-contraction" (WARNING): `strict: true` on a translate_th_en turns contraction folding off, so "Leo is playing" is
// right but "Leo's playing" is wrong, and a learner who types the natural short form is marked wrong. When a strict translation
// accepts "<name or pronoun> is / am / are (not)" it must list a contracted form of the same answer too (Leo's / I'm / isn't), or
// not be strict. Warning: a strict answer is sometimes the point of the exercise.
import type { Problem } from "../loader";
import type { RuleContext } from "./context";
import { PROPER_NAMES } from "./allowlists";

export const STRICT_CONTRACTION_RULE = "strict-contraction";
const SUBJ = `(${[...PROPER_NAMES, "I", "He", "She", "It", "We", "You", "They"].join("|")})`;
const BE_RE = new RegExp(String.raw`\b${SUBJ}\s+(am|is|are)(\s+not)?\b`, "i");

/** The contracted forms of the first "<subject> is/am/are (not)" of a sentence, as whole-sentence variants. */
export function contractions(sentence: string): string[] {
  const m = BE_RE.exec(sentence);
  if (!m) return [];
  const [whole, subj, be, not] = m;
  const be1 = be.toLowerCase();
  const short = be1 === "am" ? "'m" : be1 === "is" ? "'s" : "'re";
  const forms = not ? [`${subj}${short} not`, `${subj} ${be1 === "am" ? "am not" : be1 === "is" ? "isn't" : "aren't"}`] : [`${subj}${short}`];
  return forms.filter((f) => f !== whole).map((f) => sentence.replace(whole, f));
}

const norm = (s: string) => s.toLowerCase().replace(/[’‘ʼ´`]/g, "'").replace(/[.!?]+$/, "").trim();

export function checkStrictContraction(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  for (const { file, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        if (ex.type !== "translate_th_en" || !ex.strict) continue;
        const listed = new Set(ex.accept.map(norm));
        for (const a of ex.accept) {
          const options = contractions(a);
          if (options.length === 0 || options.some((o) => listed.has(norm(o)))) continue;
          problems.push({
            rule: STRICT_CONTRACTION_RULE, file, id: ex.id, severity: "warning",
            message: `strict translation "${a}" has no contracted form in accept (strict turns contraction folding off, so "${options[0]}" would be marked wrong). List "${options[0]}" or remove "strict".`,
          });
        }
      }
    }
  }
  return problems;
}
