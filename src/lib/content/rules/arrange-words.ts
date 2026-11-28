// Rule "arrange-words": proper nouns in arrange_words sentences. The tile UI (src/components/exercises/ui/tile-label.ts)
// shows every tile in lower case except "I" and a word capitalised in the MIDDLE of the answer or of an accepted
// sentence. So a name that only ever starts a sentence would be shown as "sam", and a capitalised mid-sentence word is
// a name the UI keeps. The content must agree: names live in PROPER_NAMES and days/months in CALENDAR_WORDS (allowlists.ts) and each name must
// appear mid-sentence in at least one of the sentences.
import type { Problem } from "../loader";
import { CALENDAR_WORDS, PROPER_NAMES } from "./allowlists";
import type { RuleContext } from "./context";

export const ARRANGE_WORDS_RULE = "arrange-words";

const strip = (w: string) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
/** "Ann's" -> "Ann". */
const owner = (w: string) => strip(w).replace(/['’]s$/i, "");
const PRONOUN_I = /^I(?:['’]\p{L}+)?$/u;
const NAMES = new Set([...PROPER_NAMES, ...CALENDAR_WORDS]);

export function checkArrangeWords(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  for (const { file, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        if (ex.type !== "arrange_words") continue;
        const sentences = [ex.answer, ...(ex.accept ?? [])];
        const initial = new Set<string>();
        const mid = new Set<string>();
        for (const s of sentences) {
          s.split(" ").forEach((token, i) => {
            const w = owner(token);
            if (!/^\p{Lu}/u.test(w) || PRONOUN_I.test(strip(token))) return;
            (i === 0 ? initial : mid).add(w);
          });
        }
        for (const w of mid) {
          if (!NAMES.has(w)) {
            problems.push({
              rule: ARRANGE_WORDS_RULE, file, id: ex.id,
              message: `"${w}" is capitalised in the middle of a sentence, so the tile UI keeps its capital, but it is not in PROPER_NAMES (src/lib/content/rules/allowlists.ts). Add the name there, or write it in lower case.`,
            });
          }
        }
        for (const w of initial) {
          if (NAMES.has(w) && !mid.has(w)) {
            problems.push({
              rule: ARRANGE_WORDS_RULE, file, id: ex.id,
              message: `"${w}" is a proper name that only starts a sentence here, so the tile UI shows it in lower case ("${w.toLowerCase()}"). Add an accepted sentence with "${w}" in the middle (e.g. "My friend is ${w}") or reword so the name is not first.`,
            });
          }
        }
      }
    }
  }
  return problems;
}
