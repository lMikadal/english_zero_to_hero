// Rules for the grammar_note exercise type (a displayed, ungraded grammar explanation card, schema.ts):
//  "grammar-note"          (ERROR)   structure ids exist in GRAMMAR_STRUCTURES, the card is the FIRST exercise of a section that is
//                                    not a pronunciation section, at most one card per lesson (list every structure in it), table
//                                    rows have the same number of cells. Structural, so no false positive is possible.
//  "grammar-note-required" (WARNING) the first lesson that USES a gated structure (learner-facing English, the card's own text
//                                    excluded) must contain a grammar_note naming it. Weeks 1-5 have no cards, so it is a
//                                    warning; make it an error later by changing GRAMMAR_NOTE_REQUIRED_SEVERITY to "error".
// Placement: why first in a section? The card is read before the practice it explains (like phoneme_intro, which also leads
// its section); why not pronunciation? that section is about sounds and phoneme-tags counts its items.
import type { Problem } from "../loader";
import type { Exercise } from "../schema";
import type { RuleContext } from "./context";
import { GRAMMAR_STRUCTURES, checkedEnglish, grammarGates, usedForms } from "./grammar-not-yet";

export const GRAMMAR_NOTE_RULE = "grammar-note";
export const GRAMMAR_NOTE_REQUIRED_RULE = "grammar-note-required";

/** The one switch that turns the missing-card warning into an error. */
export const GRAMMAR_NOTE_REQUIRED_SEVERITY: "warning" | "error" = "warning";

type Note = Extract<Exercise, { type: "grammar_note" }>;

export function checkGrammarNote(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const ids = Object.keys(GRAMMAR_STRUCTURES).join(", ");
  for (const { file, lesson } of ctx.lessons) {
    let seen = 0;
    for (const section of lesson.sections) {
      section.exercises.forEach((ex, i) => {
        if (ex.type !== "grammar_note") return;
        const add = (message: string) => problems.push({ rule: GRAMMAR_NOTE_RULE, file, id: ex.id, message });
        seen++;
        for (const s of ex.structures) {
          if (!(s in GRAMMAR_STRUCTURES)) add(`structures: "${s}" is not a grammar structure id. Use one of: ${ids} (the table GRAMMAR_STRUCTURES in src/lib/content/rules/grammar-not-yet.ts; add the structure there first if it is new).`);
        }
        if (i !== 0) add("a grammar_note must be the first exercise of its section, so the learner reads the explanation before the practice. Move it to the start of the section.");
        if (section.skill === "pronunciation") add("a grammar_note must not be in a pronunciation section (that section is about sounds). Put it first in the listening, speaking, reading or writing section.");
        if (seen === 2) add("one grammar_note per lesson: list every structure of the lesson in its `structures`, and merge the explanations into one card.");
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
          if (f.drill || f.bilingual) continue;
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
