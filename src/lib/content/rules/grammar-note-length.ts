// Rule "grammar-note-length" (WARNING): the authoring template of docs/CONTENT_SCHEMA.md keeps a card short enough for a phone.
//  - bodyTh longer than 400 characters (the template aims at ~350, 5-6 lines). Counted as the learner sees it: every code point
//    except the Thai vowel signs and tone marks that sit on a consonant (ั ิ-ฺ ็-๎), so "กิน" is 2 and "ก่" is 1 and Thai text is not
//    inflated. Spaces, Latin letters and symbols (✗ → ✓) count as 1 each.
//  - a table with more than 6 rows, HEADER INCLUDED (row 1 is the header and is drawn as a row).
//  - a "ผิดบ่อย" (common mistakes) part where a wrong form (✗) has no right form (✓) anywhere after it: write
//    "wrong ✗ → right ✓" (a compact "A ✗ / B ✗ → A2 ✓ / B2 ✓" is fine) (the incident: two cards listed wrong forms with no right form).
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

/**
 * The wrong forms (the Latin text before a ✗) of the "ผิดบ่อย" part that have no ✓ anywhere after them. A compact list is fine
 * ("A ✗ / B ✗ → A2 ✓ / B2 ✓", or one right form for two wrong ones), so only a ✗ that no ✓ follows counts as unpaired.
 */
function unpairedWrongForms(body: string): string[] {
  const at = body.indexOf("ผิดบ่อย");
  if (at < 0) return [];
  const part = body.slice(at + "ผิดบ่อย".length);
  const lastRight = part.lastIndexOf("✓");
  const out: string[] = [];
  for (let p = part.indexOf("✗"); p >= 0; p = part.indexOf("✗", p + 1)) {
    if (p < lastRight) continue;
    const chunk = part.slice(0, p).split(/[^A-Za-z'’,.\- ]/).pop()!.trim();
    out.push(chunk || "(a wrong form)");
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
