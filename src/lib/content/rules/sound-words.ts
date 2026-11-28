// Rule "sound-words": a sound named for a list of words in an instruction or tip must be in those words.
//   "ระวังเสียง /v/ ใน five, seven, sixteen และ seventeen"  /  "Watch /v/ in five, seven and sixteen"
// Every listed word that has a vocab entry must have the symbol (as a whole phoneme, see ipaContains) in its US or UK
// IPA, or the instruction teaches a sound the word does not have (the real incident: "sixteen" has no /v/).
// ERROR when the entry's IPA lacks the sound in BOTH accents; WARNING when only one of US / UK has it ("sandwich" /tʃ/ vs UK /dʒ/);
// WARNING when the word has no entry (it could not be checked).
// Not a claim, so skipped: a sound named after "ไม่ใช่" / "ต่างจาก" / "not" (a contrast, the word does NOT have it), and
// a list that starts with "the/a/an/word" ("in the word ..." is a place). Escape hatch: none; fix the list or the entry.
// Texts checked: instruction.th, instruction.en and tipTh of every exercise. Section titles and objectives are not.
import type { Problem } from "../loader";
import type { Exercise } from "../schema";
import type { RuleContext } from "./context";
import { ipaContains } from "./pronunciation";

export const SOUND_WORDS_RULE = "sound-words";
export type SoundClaim = { symbol: string; words: string[] };

const QUOTE = `['"“”‘’]?`;
const WORD = `${QUOTE}[A-Za-z][A-Za-z'’-]*${QUOTE}`;
const SEPARATOR = String.raw`(?:\s*,\s*(?:and\s+|และ\s+)?|\s+และ\s+|\s+and\s+|\s+หรือ\s+|\s+or\s+)`;
const CLAIM = new RegExp(String.raw`(?<![A-Za-z0-9])\/([^\s/฀-๿]+)\/\s*(?:ใน|in)\s+(${WORD}(?:${SEPARATOR}${WORD})*)`, "gi");
const CONTRAST = /(?:ไม่ใช่|ไม่เหมือน|ต่างจาก|ต่างกับ|not|unlike|instead of)\s*(?:เสียง|sound)?\s*$/i;
/** An English list ends where it says what the sound is NOT in ("/θ/ in three, not in this"). */
const LIST_STOPS = new Set(["not", "unlike", "but"]);
const NOT_A_WORD_LIST = new Set(["the", "a", "an", "word", "words"]);

/** The "/x/ in w1, w2 and w3" claims of a text, in order. */
export function soundClaims(text: string): SoundClaim[] {
  const out: SoundClaim[] = [];
  for (const m of text.matchAll(CLAIM)) {
    if (CONTRAST.test(text.slice(0, m.index))) continue;
    const words = (m[2].match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).map((w) => w.toLowerCase().replace(/’/g, "'").replace(/['-]+$/, "")).filter((w) => w !== "and" && w !== "or");
    const stop = words.findIndex((w) => LIST_STOPS.has(w));
    if (stop >= 0) words.splice(stop);
    if (words.length === 0 || NOT_A_WORD_LIST.has(words[0])) continue;
    out.push({ symbol: m[1], words });
  }
  return out;
}

const textsOf = (ex: Exercise): string[] => [ex.instruction.th, ex.instruction.en ?? "", ex.type === "phoneme_intro" ? ex.tipTh : ""].filter(Boolean);

export function checkSoundWords(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const byWord = new Map<string, { us: string; uk: string }[]>();
  for (const { item } of ctx.bank.values()) byWord.set(item.word.toLowerCase(), [...(byWord.get(item.word.toLowerCase()) ?? []), item.ipa]);

  for (const { file, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        for (const text of textsOf(ex)) {
          for (const { symbol, words } of soundClaims(text)) {
            const wrong: string[] = [];
            const oneAccent: string[] = [];
            const unknown: string[] = [];
            for (const w of words) {
              const entries = byWord.get(w);
              if (!entries) { unknown.push(w); continue; }
              const us = entries.some((e) => ipaContains(e.us, symbol));
              const uk = entries.some((e) => ipaContains(e.uk, symbol));
              const shown = entries.map((e) => (e.us === e.uk ? e.us : `${e.us} US, ${e.uk} UK`)).join("; ");
              if (!us && !uk) wrong.push(`"${w}" (ipa ${shown})`);
              else if (us !== uk) oneAccent.push(`"${w}" has it only in the ${us ? "US" : "UK"} IPA (ipa ${shown}); the ${us ? "UK" : "US"} IPA does not contain it`);
            }
            if (wrong.length) {
              problems.push({
                rule: SOUND_WORDS_RULE, file, id: ex.id,
                message: `the text names /${symbol}/ in a list of words, but the vocab bank's IPA says ${wrong.join("; ")} ${wrong.length === 1 ? "does" : "do"} not contain /${symbol}/. Remove ${wrong.length === 1 ? "that word" : "those words"} from the list, or name the sound the word really has.`,
              });
            }
            if (oneAccent.length) {
              problems.push({
                rule: SOUND_WORDS_RULE, file, id: ex.id, severity: "warning",
                message: `the text names /${symbol}/ in a list of words, but ${oneAccent.join("; ")}. Choose a word that has the sound in both accents, or say which accent the sound belongs to.`,
              });
            }
            if (unknown.length) {
              problems.push({
                rule: SOUND_WORDS_RULE, file, id: ex.id, severity: "warning",
                message: `the text names /${symbol}/ in a list of words, but ${unknown.map((w) => `"${w}"`).join(", ")} ${unknown.length === 1 ? "has" : "have"} no vocab entry, so the sound could not be checked. Check the IPA yourself, or add the word to the vocab bank.`,
              });
            }
          }
        }
      }
    }
  }
  return problems;
}
