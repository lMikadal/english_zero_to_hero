// Rule "thai-names": one Thai spelling per character name. THAI_NAMES (allowlists.ts) lists the spelling of every person
// of PROPER_NAMES. In a lesson whose English text contains a name, a Thai string that writes something one or two edits away
// from that name's spelling (ลีโอว for ลีโอ, นัน for แนน) is a misspelling: ERROR. A person who appears in a lesson but has no
// entry in THAI_NAMES is a WARNING that says what to add and where.
// Thai has no spaces, so the check is deliberately conservative. A candidate must: sit between the start of the string or a
// known particle on the left (ของ/กับ/และ/คือ/ว่า ...) and the end of the string or a known particle on the right (อายุ/อยู่/เป็น/สี ...); be 1-2 edits from the spelling, share
// at least len-1 letters with it in order, and be neither the exact spelling nor the spelling of ANY listed name (แอน is
// one edit from แนน). Names whose spelling is an everyday word (ไหม, นก, เล็ก, ฝน) are not checked for misspellings.
// NOT detected: a misspelling next to a particle that is not in the lists below, a name spelled correctly but for the wrong
// person, a Thai name in a string with no English counterpart in the same lesson.
import type { Problem } from "../loader";
import { PLACE_NAMES, PROPER_NAMES, THAI_NAMES, THAI_NAME_IS_A_WORD } from "./allowlists";
import type { RuleContext } from "./context";

export const THAI_NAMES_RULE = "thai-names";

/** What may stand directly before / after a name in Thai text (besides the start, the end, a space or a non-Thai character). */
const BEFORE = ["ของ", "กับ", "และ", "คือ", "ว่า", "ถาม", "ชื่อ", "ให้", "แก่", "เพื่อน", "พี่", "น้อง"];
const AFTER = ["อายุ", "อยู่", "เป็น", "มา", "ไป", "สะกด", "ทำ", "พูด", "ถาม", "ตอบ", "ใส่", "ชอบ", "มี", "กับ", "และ", "คือ", "ซื้อ", "อาศัย", "สี", "ราคา", "เท่า", "ที่", "ใช่", "ก็", "หรือ", "ได้", "ต้อง", "บอก", "พบ", "เจอ", "รัก", "จะ", "กำลัง", "ไม่", "ใน", "ด้วย"];

/**
 * Ordinary Thai words that are one edit from a name and can stand where a name stands (เบา "light" ~ เบน). A word is added
 * here only when the rule fired on it in real content and it really is that word; never to silence a misspelling.
 */
const NOT_A_NAME: ReadonlySet<string> = new Set(["เบา"]);

const THAI = /[฀-๿]/;
const cp = (s: string) => [...s];

function editDistance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

function lcs(a: string[], b: string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Misspellings of the listed spellings in `text`. `forms` are the names to check (name -> Thai spelling); `known` are the
 * spellings that count as correct Thai names whatever the lesson (default: `forms`).
 */
export function thaiNameMismatches(text: string, forms: Readonly<Record<string, string>>, known: Readonly<Record<string, string>> = forms): { found: string; name: string }[] {
  const chars = cp(text);
  const knownSet = new Set([...Object.values(known), ...Object.values(forms)]);
  const out: { found: string; name: string }[] = [];
  const boundaryBefore = (i: number) => i === 0 || BEFORE.some((p) => chars.slice(Math.max(0, i - cp(p).length), i).join("") === p);
  const boundaryAfter = (j: number) => j === chars.length || AFTER.some((p) => chars.slice(j, j + cp(p).length).join("") === p);
  for (const [name, form] of Object.entries(forms)) {
    if (THAI_NAME_IS_A_WORD.includes(name)) continue;
    const f = cp(form);
    if (f.length < 3) continue;
    for (let i = 0; i < chars.length; i++) {
      if (!THAI.test(chars[i]) || !boundaryBefore(i)) continue;
      for (let len = f.length + 1; len >= f.length - 1; len--) {
        const w = chars.slice(i, i + len);
        if (w.length !== len || !w.every((c) => THAI.test(c)) || !boundaryAfter(i + len)) continue;
        const s = w.join("");
        if (knownSet.has(s) || NOT_A_NAME.has(s)) continue;
        const d = editDistance(w, f);
        if (d >= 1 && d <= 2 && lcs(w, f) >= f.length - 1) {
          out.push({ found: s, name });
          i += len - 1;
          break;
        }
      }
    }
  }
  return out;
}

/** Every string of a lesson with the id of the exercise it is in. Pronunciation tips (`tipTh`) explain Thai sounds, not people: skipped. */
function* strings(o: unknown, ex?: string): Generator<{ text: string; id?: string }> {
  if (typeof o === "string") yield { text: o, id: ex };
  else if (Array.isArray(o)) for (const v of o) yield* strings(v, ex);
  else if (o && typeof o === "object") {
    const id = typeof (o as { id?: unknown }).id === "string" ? (o as { id: string }).id : ex;
    for (const [k, v] of Object.entries(o)) if (k !== "tipTh") yield* strings(v, id);
  }
}

const PEOPLE = PROPER_NAMES.filter((n) => !PLACE_NAMES.includes(n));

export function checkThaiNames(ctx: RuleContext, table: Readonly<Record<string, string>> = THAI_NAMES): Problem[] {
  const problems: Problem[] = [];
  const warned = new Set<string>();
  for (const { file, lesson } of ctx.lessons) {
    const all = [...strings(lesson)];
    const english = all.filter((s) => !THAI.test(s.text));
    const present = new Set(PEOPLE.filter((n) => english.some((s) => new RegExp(`\\b${n}\\b`).test(s.text))));
    for (const name of present) {
      if (name in table || warned.has(name)) continue;
      warned.add(name);
      problems.push({
        rule: THAI_NAMES_RULE, file, id: english.find((s) => new RegExp(`\\b${name}\\b`).test(s.text))?.id, severity: "warning",
        message: `"${name}" has no Thai spelling yet: add the Thai spelling of "${name}" to THAI_NAMES in src/lib/content/rules/allowlists.ts (one spelling for every lesson), then write it that way in every Thai text.`,
      });
    }
    const forms = Object.fromEntries(Object.entries(table).filter(([n]) => present.has(n)));
    for (const s of all) {
      if (!THAI.test(s.text)) continue;
      for (const m of thaiNameMismatches(s.text, forms, table)) {
        problems.push({
          rule: THAI_NAMES_RULE, file, id: s.id,
          message: `"${s.text}" writes "${m.found}", which looks like a misspelling of the name "${m.name}" (its Thai spelling is "${table[m.name]}", THAI_NAMES in src/lib/content/rules/allowlists.ts). Write "${table[m.name]}" everywhere; if "${m.found}" is a different word, reword the sentence.`,
        });
      }
    }
  }
  return problems;
}
