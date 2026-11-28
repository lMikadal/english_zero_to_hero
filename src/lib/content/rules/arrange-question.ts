// Rule "arrange-question": a statement "<Subject> is/are/am ..." (or "<Subject> <modal> ...") in an arrange_words
// exercise has the same tiles as the yes/no question ("Is <subject> ..."). A learner may build either, so the
// question must be in `accept`, or the exercise says `statementOnly: true`. ERROR, not warning: the generated
// question is always correct English, the skipped cases below are the only ones where it would not be, and
// `statementOnly` is the escape for the rest.
//
// Deliberately narrow (precise rather than clever). NOT checked: negatives ("I am not ..."), wh-questions, "Yes, ..."
// answers, sentences with a comma, two clauses (a second is/are/modal, or and/but/or/because/so/if/when after the verb),
// "Here is ...", imperatives and openers ("Please be ..."), contractions ("She's ..."), "do/does" statements.
import { canonicalAnswer } from "@/lib/answers/equivalents";
import { normalizeAnswer } from "@/lib/answers/normalize";
import type { Problem } from "../loader";
import { PROPER_NAMES } from "./allowlists";
import type { RuleContext } from "./context";

export const ARRANGE_QUESTION_RULE = "arrange-question";

const VERBS = new Set(["is", "are", "am", "can", "could", "should", "must", "will", "would"]);
const WH = new Set(["who", "what", "where", "when", "why", "how", "which", "whose"]);
/** First words of a sentence that is not "Subject + verb": answers, openers, imperatives, places and times. */
const NOT_A_SUBJECT = new Set(["yes", "no", "here", "please", "thanks", "thank", "hello", "hi", "sorry", "ok", "okay", "let", "do", "does", "don't",
  "in", "on", "at", "today", "now", "then", "after", "before", "every", "always", "sometimes", "never"]);
const CLAUSE_WORDS = new Set(["and", "but", "or", "because", "so", "if", "when", "not"]);
const NAMES = new Set(PROPER_NAMES);

const norm = (s: string) => canonicalAnswer(normalizeAnswer(s));
const counts = (tokens: string[]) => tokens.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map<string, number>());

/** The yes/no question with the same words, or undefined when the sentence is not a plain "Subject + verb ..." statement. */
export function questionForm(answer: string): string | undefined {
  if (/[,;:?!]/.test(answer)) return undefined;
  const tokens = answer.replace(/\.$/, "").split(" ").filter(Boolean);
  const lower = tokens.map((t) => t.toLowerCase());
  if (lower.length < 3 || WH.has(lower[0]) || NOT_A_SUBJECT.has(lower[0])) return undefined;
  const v = lower.findIndex((t) => VERBS.has(t));
  if (v < 1) return undefined;
  if (lower.slice(0, v).some((t) => CLAUSE_WORDS.has(t) && t !== "and")) return undefined;
  if (lower.slice(v + 1).some((t) => VERBS.has(t) || CLAUSE_WORDS.has(t))) return undefined;
  const subject = tokens.slice(0, v).map((t, i) => (i === 0 && !NAMES.has(t) && t !== "I" ? t.toLowerCase() : t));
  const verb = tokens[v];
  return [verb[0].toUpperCase() + verb.slice(1).toLowerCase(), ...subject, ...tokens.slice(v + 1)].join(" ");
}

export function checkArrangeQuestion(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        if (ex.type !== "arrange_words" || ex.statementOnly === true) continue;
        const question = questionForm(ex.answer);
        if (question === undefined) continue;
        const tiles = counts(norm(ex.words.join(" ")).split(" "));
        const needed = counts(norm(question).split(" "));
        if ([...needed].some(([w, n]) => (tiles.get(w) ?? 0) < n)) continue; // the tiles cannot build it
        if ((ex.accept ?? []).some((a) => norm(a) === norm(question))) continue;
        problems.push({
          rule: ARRANGE_QUESTION_RULE, file, id: ex.id,
          message: `"${ex.answer}" has the same tiles as the yes/no question "${question}", so a learner can build the question, but it is not in accept and would be marked wrong. Add "${question}" to accept, or set "statementOnly": true if only the statement may be accepted.`,
        });
      }
    }
  }
  return problems;
}
