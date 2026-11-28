// Rule "arrange-question": a statement "<Subject> is/are/am ..." (or "<Subject> <modal> ...") in an arrange_words
// exercise has the same tiles as the yes/no question ("Is <subject> ..."). A learner may build either, so the
// question must be in `accept`, or the exercise says `statementOnly: true`. ERROR, not warning: the generated
// question is always correct English, the skipped cases below are the only ones where it would not be, and
// `statementOnly` is the escape for the rest.
//
// Deliberately narrow (precise rather than clever): a question is generated ONLY from a positive definition of the subject.
// Everything before the verb must be a subject noun phrase made of: a pronoun (I, you, he, she, it, we, they, there, this ...),
// an optional determiner or possessive ("my", "the", "Tom's"), an optional number, adjectives of the bank, nouns of the bank
// or proper names (PROPER_NAMES, or "Mr/Mrs/Ms/Miss/Dr" + a capitalised name), joined by "and", with at most a place phrase
// inside it ("The cat in the box is big"). Anything else before the verb (an adverb or time word: "Tomorrow we will ...",
// "Maybe she is ...", "Usually I am ...", a phrase: "Of course he is ...") or any word the bank does not know
// produces NO question, because the inverted sentence would not be English. Also not checked: negatives ("I am not ..."),
// wh-questions, "Yes, ..." answers, sentences with a comma, two clauses (a second is/are/modal, or and/but/or/because/so/if/when
// after the verb), "Here is ...", imperatives and openers ("Please be ..."), contractions ("She's ..."), "do/does" statements.
import { ADJECTIVES, NUMBER_WORDS, canonicalAnswer } from "@/lib/answers/equivalents";
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
const SUBJECT_PRONOUNS = new Set(["i", "you", "he", "she", "it", "we", "they", "there"]);
const DEMONSTRATIVES = new Set(["this", "that", "these", "those"]);
const DETERMINERS = new Set(["a", "an", "the", "my", "your", "his", "her", "our", "their", "its", "some", "any", "no", "many", "all", "both", "each", "every", "another"]);
const TITLES = new Set(["Mr", "Mrs", "Ms", "Miss", "Dr"]);
const PLACE_WORDS = new Set(["in", "on", "at", "under", "near", "behind", "from", "with", "of"]);
const NUMBER_TOKENS = new Set(NUMBER_WORDS.flatMap(([, w]) => w.split(" ")).concat(["zero", "hundred"]));
const owner = (t: string) => t.replace(/['’]s$/i, "");

/** The words a subject may be built from, besides the closed lists above: the bank's nouns and adjectives. */
export type SubjectVocab = { nouns: ReadonlySet<string>; adjectives: ReadonlySet<string> };

export function subjectVocab(ctx: RuleContext): SubjectVocab {
  const nouns = new Set<string>();
  const adjectives = new Set<string>(ADJECTIVES);
  for (const { item } of ctx.bank.values()) {
    const w = item.word.toLowerCase();
    if (item.pos === "adjective") adjectives.add(w);
    if (item.pos !== "noun") continue;
    nouns.add(w).add(`${w}s`).add(`${w}es`);
    if (/[^aeiou]y$/.test(w)) nouns.add(`${w.slice(0, -1)}ies`);
    if (item.forms?.plural) for (const p of item.forms.plural.toLowerCase().split("/")) nouns.add(p.trim());
  }
  return { nouns, adjectives };
}

/** True when `tokens` (the words before the verb) are exactly one subject noun phrase, or several joined by "and" / a place phrase. */
function isSubject(tokens: readonly string[], v: SubjectVocab): boolean {
  const low = tokens.map((t) => t.toLowerCase());
  const isName = (i: number) => NAMES.has(owner(tokens[i]));
  const isHead = (i: number) => v.nouns.has(low[i]) || isName(i);
  /** End index of the noun phrase starting at i, or -1; `pronoun` tells whether it was a bare pronoun. */
  const phrase = (i: number): { end: number; pronoun: boolean } | undefined => {
    if (i >= tokens.length) return undefined;
    if (tokens[i] === "I" || SUBJECT_PRONOUNS.has(low[i])) return { end: i + 1, pronoun: true };
    if (TITLES.has(tokens[i]) && /^\p{Lu}/u.test(tokens[i + 1] ?? "")) return { end: i + 2, pronoun: false };
    let j = i;
    const possessiveName = /['’]s$/i.test(tokens[j]) && isName(j);
    if (DEMONSTRATIVES.has(low[j]) || DETERMINERS.has(low[j]) || possessiveName) j++;
    const afterDet = j;
    if (j < tokens.length && (/^\d+$/.test(low[j]) || NUMBER_TOKENS.has(low[j]))) j++;
    while (j < tokens.length && v.adjectives.has(low[j]) && !isHead(j)) j++;
    const headStart = j;
    while (j < tokens.length && isHead(j) && !(possessiveName && j === i)) j++;
    if (j > headStart) return { end: j, pronoun: false };
    // "This is ...", "These are ...": a bare demonstrative is the subject itself
    if (afterDet === i + 1 && j === afterDet && DEMONSTRATIVES.has(low[i])) return { end: j, pronoun: true };
    return undefined;
  };
  let cur = phrase(0);
  if (!cur) return false;
  let i = cur.end;
  while (i < tokens.length) {
    if (low[i] === "and") cur = phrase(i + 1);
    else if (PLACE_WORDS.has(low[i]) && !cur.pronoun) cur = phrase(i + 1);
    else return false;
    if (!cur) return false;
    i = cur.end;
  }
  return true;
}

const norm = (s: string) => canonicalAnswer(normalizeAnswer(s));
const counts = (tokens: string[]) => tokens.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map<string, number>());

/** The yes/no question with the same words, or undefined when the sentence is not a plain "Subject + verb ..." statement. */
export function questionForm(answer: string, vocab: SubjectVocab): string | undefined {
  if (/[,;:?!]/.test(answer)) return undefined;
  const tokens = answer.replace(/\.$/, "").split(" ").filter(Boolean);
  const lower = tokens.map((t) => t.toLowerCase());
  if (lower.length < 3 || WH.has(lower[0]) || NOT_A_SUBJECT.has(lower[0])) return undefined;
  const v = lower.findIndex((t) => VERBS.has(t));
  if (v < 1) return undefined;
  if (lower.slice(v + 1).some((t) => VERBS.has(t) || CLAUSE_WORDS.has(t))) return undefined;
  if (!isSubject(tokens.slice(0, v), vocab)) return undefined;
  const keepCase = (t: string) => t === "I" || NAMES.has(owner(t)) || TITLES.has(t);
  const subject = tokens.slice(0, v).map((t, i) => (i === 0 && !keepCase(t) ? t.toLowerCase() : t));
  const verb = tokens[v];
  return [verb[0].toUpperCase() + verb.slice(1).toLowerCase(), ...subject, ...tokens.slice(v + 1)].join(" ");
}

export function checkArrangeQuestion(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const vocab = subjectVocab(ctx);
  for (const { file, lesson } of ctx.lessons) {
    for (const section of lesson.sections) {
      for (const ex of section.exercises) {
        if (ex.type !== "arrange_words" || ex.statementOnly === true) continue;
        const question = questionForm(ex.answer, vocab);
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
