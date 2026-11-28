// Rule "pronunciation": consistency of pronunciation items.
//  (a) repeat_after_me: the IPA has as many words as the text (catches IPA copied from another sentence).
//  (b) minimal_pair: no heteronyms, which TTS voices read unpredictably.
//  (c) an IPA symbol named between slashes in an instruction must occur in the item's own IPA.
// Escape hatch: none. Change the text, the IPA or the instruction.
import type { Problem } from "../loader";
import type { Exercise } from "../schema";
import type { RuleContext } from "./context";

export const PRONUNCIATION_RULE = "pronunciation";

/** Words whose pronunciation depends on meaning; a TTS voice may pick the wrong one. Extend when one is found. */
export const HETERONYMS: readonly string[] = [
  "live", "read", "lead", "wind", "tear", "close", "bow", "row", "use", "present", "record", "object", "minute",
  "wound", "bass", "dove", "sow", "polish", "refuse", "resume", "content", "desert", "produce", "project", "subject",
  "permit", "contract", "excuse", "separate", "invalid",
];

/** Symbols written between slashes, e.g. "/ɔː/". A slash must start the symbol (so "and/or/not" and "am / is / are" are not symbols). */
export function namedIpaSymbols(text: string): string[] {
  return [...text.matchAll(/(?<![A-Za-z0-9])\/([^\s/\u0E00-\u0E7F]+)\//g)].map((m) => m[1]);
}

/** Phonemes longest first, so "tʃ" is one phoneme and "aɪ" is not "a" + "ɪ". Stress and length marks are not phonemes. */
const PHONEMES = ["tʃ", "dʒ", "eɪ", "aɪ", "ɔɪ", "aʊ", "oʊ", "əʊ", "ɪə", "eə", "ʊə", "iː", "uː", "ɔː", "ɜː", "ɑː", "æː"];
/** Typing variants of one symbol: ASCII g, the ligatures ʧ ʤ, and ɹ for r. */
const normaliseIpa = (ipa: string) => ipa.replace(/g/g, "ɡ").replace(/ʧ/g, "tʃ").replace(/ʤ/g, "dʒ").replace(/ɹ/g, "r");

export function ipaTokens(ipa: string): string[] {
  const chars = [...normaliseIpa(ipa).replace(/[\/ˈˌ.\s]/g, "")];
  const out: string[] = [];
  for (let i = 0; i < chars.length; ) {
    const two = chars[i] + (chars[i + 1] ?? "");
    if (PHONEMES.includes(two)) {
      out.push(two);
      i += 2;
    } else {
      out.push(chars[i]);
      i += 1;
    }
  }
  return out;
}

/** A vowel written without the length mark (/ɑ/, /ɔ/, /ɜ/) matches the long vowel of the bank; /i/ and /u/ do not (they are other sounds). */
const LONG_OF = new Set(["ɑ", "ɔ", "ɜ"]);
const sameToken = (hay: string | undefined, needle: string) => hay === needle || (LONG_OF.has(needle) && hay === `${needle}ː`);

/** True when `symbol` (one or more phonemes) occurs in `ipa` as whole phonemes. Typing variants are normalised (see normaliseIpa). */
export function ipaContains(ipa: string, symbol: string): boolean {
  const hay = ipa.split(/\s+/).map(ipaTokens);
  const needle = ipaTokens(symbol);
  return hay.some((word) => word.some((_, i) => needle.every((n, k) => sameToken(word[i + k], n))));
}

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const ipaWords = (ipa: string) => ipa.replace(/\//g, " ").split(/\s+/).filter(Boolean);

export function checkPronunciation(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const ipaByWord = new Map<string, string>();
  for (const { item } of ctx.bank.values()) ipaByWord.set(item.word.toLowerCase(), `${item.ipa.us} ${item.ipa.uk}`);

  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        const add = (message: string) => problems.push({ rule: PRONUNCIATION_RULE, file, id: ex.id, message });
        if (ex.type === "repeat_after_me" && ex.ipa) {
          const t = words(ex.text).length;
          const i = ipaWords(ex.ipa).length;
          if (t !== i) add(`ipa "${ex.ipa}" has ${i} word(s) but text "${ex.text}" has ${t} word(s); the IPA probably belongs to another sentence.`);
        }
        if (ex.type === "minimal_pair") {
          ex.pairs.forEach((p, n) => {
            for (const w of [p.a, p.b]) {
              if (HETERONYMS.includes(w.trim().toLowerCase())) {
                add(`pairs[${n}]: "${w.toLowerCase()}" is a heteronym (its pronunciation depends on meaning), so TTS voices may read it wrongly. Choose another word.`);
              }
            }
          });
        }
        for (const sym of symbolsToCheck(ex)) {
          const own = ownIpa(ex, ipaByWord);
          if (!ipaContains(own, sym)) {
            add(`the instruction names /${sym}/ but ${own ? `the item's ipa "${own.trim()}" does not contain it` : "the item has no ipa to check it against"}. Practise the sound in an item whose ipa contains it, or change the instruction.`);
          }
        }
      }
    }
  }
  return problems;
}

/** Symbols named in the instruction, for the item types where they can be checked. (A phoneme_intro tip may name other sounds for contrast, so only its instruction counts.) */
function symbolsToCheck(ex: Exercise): string[] {
  if (ex.type !== "repeat_after_me" && ex.type !== "phoneme_intro") return [];
  return namedIpaSymbols(`${ex.instruction.th} ${ex.instruction.en ?? ""}`);
}

/** The IPA an item can be checked against: its own, plus (phoneme_intro) the bank IPA of its example words. */
function ownIpa(ex: Exercise, ipaByWord: Map<string, string>): string {
  if (ex.type === "repeat_after_me") return ex.ipa ?? "";
  if (ex.type === "phoneme_intro") return [ex.ipa, ...ex.examples.map((w) => ipaByWord.get(w.toLowerCase()) ?? "")].join(" ");
  return "";
}
