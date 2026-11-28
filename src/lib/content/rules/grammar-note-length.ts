// Rule "grammar-note-length" (WARNING): the authoring template of docs/CONTENT_SCHEMA.md keeps a card short enough for a phone.
//  - bodyTh longer than 400 characters (the template aims at ~350, 5-6 lines). Counted as the learner sees it: every code point
//    except the Thai vowel signs and tone marks that sit on a consonant (ั ิ-ฺ ็-๎), so "กิน" is 2 and "ก่" is 1 and Thai text is not
//    inflated. Spaces, Latin letters and symbols (✗ → ✓) count as 1 each.
//  - a table with more than 6 rows, HEADER INCLUDED (row 1 is the header and is drawn as a row).
//  - a "ผิดบ่อย" (common mistakes) part where a wrong form (✗) has no right form (✓) after it, before the next ✗: write
//    "wrong ✗ → right ✓" every time (the incident: two cards listed wrong forms with no right form).
// Warnings: a card a little over the limit can still be good; the template is the decision of the owner (2026-11-29).
import type { Problem } from "../loader";
import type { RuleContext } from "./context";

export const GRAMMAR_NOTE_LENGTH_RULE = "grammar-note-length";
export const GRAMMAR_NOTE_MAX_BODY = 400;
export const GRAMMAR_NOTE_TARGET_BODY = 350;
export const GRAMMAR_NOTE_MAX_ROWS = 6;

const COMBINING = /[ัิ-ฺ็-๎]/;
/** User-perceived length of a body: code points without the Thai combining vowel signs and tone marks. */
export const bodyLength = (s: string): number => [...s].filter((c) => !COMBINING.test(c)).length;

/** The wrong forms (text before each ✗) of the "ผิดบ่อย" part that have no ✓ before the next ✗ or the end. */
function unpairedWrongForms(body: string): string[] {
  const at = body.indexOf("ผิดบ่อย");
  if (at < 0) return [];
  const part = body.slice(at + "ผิดบ่อย".length);
  const pieces = part.split("✗");
  const out: string[] = [];
  for (let i = 0; i < pieces.length - 1; i++) {
    const after = pieces[i + 1];
    // the text after this ✗ and before the next ✗ must hold the right form; the last piece also holds trailing prose after the final ✓
    if (!after.includes("✓")) {
      const wrong = pieces[i].replace(/^[\s:：\/,]+/, "").split(/✓|\s\/\s|[;]/).pop()!.replace(/^.*?(?:และ|ส่วน|หรือ|→)\s+(?=[A-Za-z])/, "").trim();
      out.push(wrong || pieces[i].trim());
    }
  }
  return out;
}

export function checkGrammarNoteLength(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        if (ex.type !== "grammar_note") continue;
        const warn = (message: string) => problems.push({ rule: GRAMMAR_NOTE_LENGTH_RULE, file, id: ex.id, severity: "warning", message });
        const n = bodyLength(ex.bodyTh);
        if (n > GRAMMAR_NOTE_MAX_BODY) warn(`bodyTh is ${n} characters long (limit ${GRAMMAR_NOTE_MAX_BODY}, the template aims at about ${GRAMMAR_NOTE_TARGET_BODY}, 5-6 lines on a phone). Cut the explanation to the rule, one or two examples and the common mistakes.`);
        if (ex.table && ex.table.length > GRAMMAR_NOTE_MAX_ROWS) warn(`the table has ${ex.table.length} rows including the header, at most ${GRAMMAR_NOTE_MAX_ROWS} fit the card. Remove rows or move them to the examples.`);
        const unpaired = unpairedWrongForms(ex.bodyTh);
        if (unpaired.length) {
          warn(`in the "ผิดบ่อย" part ${unpaired.map((w) => `"${w}"`).join(", ")} ${unpaired.length === 1 ? "is" : "are"} marked ✗ but no right form ✓ follows. Write every mistake as wrong ✗ → right ✓ (for example "I have tea always ✗ → I always have tea ✓").`);
        }
      }
    }
  }
  return problems;
}
