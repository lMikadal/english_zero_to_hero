// Rules for the grammar_note exercise type (a displayed, ungraded grammar explanation card, schema.ts):
//  "grammar-note"          (ERROR)   structure ids exist in GRAMMAR_STRUCTURES and are not taught before their day (a card cannot
//                                    bring a form in early), the card is the FIRST exercise of a section that is not a pronunciation
//                                    section (so at most one card per section, each before the practice it explains), a structure is
//                                    in only one card of a lesson, table rows have the same number of cells, and row 1 (always the header) is written in Thai. Structural, so no false
//                                    positive is possible.
//  "grammar-note-required" (WARNING) the first lesson that USES a gated structure (learner-facing English, the card's own text
//                                    excluded) must contain a grammar_note naming it. Weeks 1-5 have no cards, so it is a
//                                    warning; make it an error later by changing GRAMMAR_NOTE_REQUIRED_SEVERITY to "error".
// Placement: why first in a section? The card is read before the practice it explains (like phoneme_intro, which also leads
// its section); why not pronunciation? that section is about sounds and phoneme-tags counts its items.
import type { Problem } from "../loader";
import type { Exercise } from "../schema";
import type { RuleContext } from "./context";
import { GRAMMAR_STRUCTURES, checkedEnglish, grammarGates, isExtraAccept, usedForms } from "./grammar-not-yet";

export const GRAMMAR_NOTE_RULE = "grammar-note";
export const GRAMMAR_NOTE_REQUIRED_RULE = "grammar-note-required";

/** The one switch that turns the missing-card warning into an error. */
export const GRAMMAR_NOTE_REQUIRED_SEVERITY: "warning" | "error" = "warning";

type Note = Extract<Exercise, { type: "grammar_note" }>;

export function checkGrammarNote(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const ids = Object.keys(GRAMMAR_STRUCTURES).join(", ");
  for (const { file, lesson } of ctx.lessons) {
    const cardOf = new Map<string, string>(); // structure -> the card of this lesson that lists it
    for (const section of lesson.sections) {
      section.exercises.forEach((ex, i) => {
        if (ex.type !== "grammar_note") return;
        const add = (message: string) => problems.push({ rule: GRAMMAR_NOTE_RULE, file, id: ex.id, message });
        for (const s of ex.structures) {
          const known = GRAMMAR_STRUCTURES[s];
          if (!known) add(`structures: "${s}" is not a grammar structure id. Use one of: ${ids} (the table GRAMMAR_STRUCTURES in src/lib/content/rules/grammar-not-yet.ts; add the structure there first if it is new).`);
          else if (known.day > lesson.day) add(`structure "${s}" is not taught before day ${known.day} (this is day ${lesson.day}): a grammar_note cannot bring a form in early. Move the card to day ${known.day} or later, or take "${s}" out of this card.`);
          const first = cardOf.get(s);
          if (first !== undefined && first !== ex.id) add(`structure "${s}" is already explained by ${first}; list a structure in only one grammar_note per lesson (put each card in the section whose practice it explains).`);
          else cardOf.set(s, ex.id);
        }
        if (i !== 0) add("a grammar_note must be the first exercise of its section, so the learner reads the explanation before the practice. Move it to the start of the section.");
        if (section.skill === "pronunciation") add("a grammar_note must not be in a pronunciation section (that section is about sounds). Put it first in the listening, speaking, reading or writing section.");
        const header = ex.table?.[0] ?? [];
        // a cell cannot be empty, so an empty corner cell is written as a bare dash: that is allowed in the header
        const notThai = header.filter((c) => !/[\u0E00-\u0E7F]/.test(c) && !/^[\s\-\u2010-\u2015]+$/.test(c));
        if (notThai.length > 0) {
          add(`table row 1 is the header (the card always shows the first row as the header) and must be written in Thai, but ${notThai.map((c) => `"${c}"`).join(", ")} has no Thai letter (a bare "-" is fine for an empty corner cell). Write each header cell in Thai (for example "ประธาน", "กริยา") and keep the English forms in the rows below.`);
        }
        const width = ex.table?.[0]?.length ?? 0;
        ex.table?.forEach((row, r) => {
          if (row.length !== width) add(`table row ${r + 1} has ${row.length} cell(s) but row 1 has ${width}. Give every row the same number of cells (a cell cannot be empty: write a dash "-").`);
        });
      });
    }
  }
  return problems;
}

export function checkGrammarNoteRequired(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const gate = grammarGates(ctx);
  const done = new Set<string>();
  for (const { file, lesson } of ctx.lessons) {
    const covered = new Set(lesson.sections.flatMap((s) => s.exercises.flatMap((e): string[] => (e.type === "grammar_note" ? (e as Note).structures : []))));
    const first = new Map<string, { form: string; id: string; field: string }>();
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        if (ex.type === "grammar_note") continue;
        for (const f of checkedEnglish(ex)) {
          if (f.drill || f.bilingual || isExtraAccept(ex, f.field)) continue; // an extra accepted answer introduces nothing
          for (const form of usedForms(f.text, gate)) {
            const structure = gate.get(form)!.structure;
            if (!first.has(structure)) first.set(structure, { form, id: ex.id, field: f.field });
          }
        }
      }
    }
    for (const [structure, use] of first) {
      if (done.has(structure)) continue;
      done.add(structure); // later lessons need no card: the structure was already introduced
      if (covered.has(structure)) continue;
      problems.push({
        rule: GRAMMAR_NOTE_REQUIRED_RULE, file, id: use.id, ...(GRAMMAR_NOTE_REQUIRED_SEVERITY === "warning" ? { severity: "warning" as const } : {}),
        message: `the grammar structure "${structure}" (${GRAMMAR_STRUCTURES[structure]?.what ?? structure}) is used for the first time on day ${lesson.day} ("${use.form}" in ${use.id} ${use.field}) but the lesson has no grammar_note that explains it. Add a grammar_note as the first exercise of a section (not pronunciation) with "structures": ["${structure}"], a Thai explanation (titleTh, bodyTh) and 1-6 examples.`,
      });
    }
  }
  return problems;
}
