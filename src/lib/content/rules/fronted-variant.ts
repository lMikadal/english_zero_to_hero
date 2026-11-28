// Rule "fronted-variant" (WARNING): an arrange_words or translate_th_en answer that has a frontable element must also accept the
// sentence with that element FIRST. Frontable: the adverbs "sometimes" and "usually" (not already initial), and a TRAILING time or
// place phrase: "every day|week|month|year|morning|afternoon|evening|night|weekend", "at the weekend", "at weekends", "at night",
// "in the morning|afternoon|evening", "on <weekday>(s)", and "after|before <1-3 words>". The incident: six week-7 items rejected
// "Sometimes we watch a film" and "Every day I walk to school", which the grammar card itself teaches.
// Never demanded: always, never, often (fronting them is unnatural); questions and imperatives; an adverb in a sentence with a comma or
// and/but/or (the adverb may belong to one clause); "look/take/ask after"; an after/before phrase that contains is/are/am (a noun phrase
// before the verb: "The class before lunch is big"). KNOWN false positive: a trailing "after X" may modify the object noun ("I like the
// class after lunch"); the warning then asks for a sentence that means something else (reword the item or ignore the warning).
// Dictation is not checked (it has one text), nor fill_blank.
import { canonicalAnswer } from "@/lib/answers/equivalents";
import { normalizeAnswer } from "@/lib/answers/normalize";
import type { Problem } from "../loader";
import { PROPER_NAMES } from "./allowlists";
import type { RuleContext } from "./context";

export const FRONTED_VARIANT_RULE = "fronted-variant";

const FRONT_ADVERBS = new Set(["sometimes", "usually"]);
const QUESTION_START = new Set(["do", "does", "did", "is", "are", "am", "was", "were", "can", "could", "will", "would", "should", "have", "has", "how", "what", "where", "when", "why", "who", "which", "whose"]);
const IMPERATIVE_START = new Set(["please", "let's", "don't", "go", "come", "sit", "stand", "look", "listen", "open", "close", "take", "give", "write", "read", "say", "repeat", "speak",
  "tell", "ask", "answer", "wait", "stop", "eat", "drink", "be", "put", "bring", "help", "try", "turn", "wash", "use", "buy", "match", "choose", "spell"]);
const EVERY_UNIT = new Set(["day", "week", "month", "year", "morning", "afternoon", "evening", "night", "weekend"]);
const DAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays", "sundays", "weekdays"]);
const PARTS_OF_DAY = new Set(["morning", "afternoon", "evening"]);
const BE = new Set(["is", "are", "am", "was", "were"]);
const NAMES = new Set(PROPER_NAMES);
const TITLES = new Set(["Mr", "Mrs", "Ms", "Miss", "Dr"]);

const norm = (s: string) => canonicalAnswer(normalizeAnswer(s));
const keepCase = (t: string) => t === "I" || NAMES.has(t.replace(/['’]s$/, "")) || TITLES.has(t);
const front = (phrase: string[], rest: string[]): string => {
  const words = [...phrase.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)), ...rest.map((w, i) => (i === 0 && !keepCase(w) ? w[0].toLowerCase() + w.slice(1) : w))];
  return words.join(" ");
};

/** The variants of `sentence` with a frontable element first (none when it is a question, an imperative or needs nothing). */
export function frontedVariants(sentence: string, bankVerbs: ReadonlySet<string> = new Set()): { element: string; variant: string }[] {
  if (/\?\s*$/.test(sentence)) return [];
  const s = sentence.replace(/[.!?]+$/, "").trim();
  const tokens = s.split(/\s+/);
  const lower = tokens.map((t) => t.toLowerCase());
  if (tokens.length < 3 || QUESTION_START.has(lower[0]) || IMPERATIVE_START.has(lower[0]) || bankVerbs.has(lower[0])) return [];
  const out: { element: string; variant: string }[] = [];

  const adv = lower.findIndex((t, i) => i > 0 && FRONT_ADVERBS.has(t));
  if (adv > 0 && !/,/.test(s) && !lower.some((t) => t === "and" || t === "but" || t === "or")) {
    out.push({ element: lower[adv], variant: front([tokens[adv]], [...tokens.slice(0, adv), ...tokens.slice(adv + 1)]) });
  }

  const n = tokens.length;
  let start = -1;
  if (n >= 4 && lower[n - 2] === "every" && EVERY_UNIT.has(lower[n - 1])) start = n - 2;
  if (start < 0 && n >= 4 && lower[n - 3] === "at" && lower[n - 2] === "the" && lower[n - 1] === "weekend") start = n - 3;
  if (start < 0 && n >= 4 && lower[n - 2] === "at" && (lower[n - 1] === "weekends" || lower[n - 1] === "night")) start = n - 2;
  if (start < 0 && n >= 5 && lower[n - 3] === "in" && lower[n - 2] === "the" && PARTS_OF_DAY.has(lower[n - 1])) start = n - 3;
  if (start < 0 && n >= 4 && lower[n - 2] === "on" && DAYS.has(lower[n - 1])) start = n - 2;
  if (start < 0) {
    for (let k = n - 2; k >= Math.max(2, n - 4); k--) {
      if ((lower[k] === "after" || lower[k] === "before") && !/^(look|looks|looked|looking|take|takes|ask|asks)$/.test(lower[k - 1]) && !lower.slice(k + 1).some((t) => BE.has(t))) { start = k; break; }
    }
  }
  if (start >= 2) out.push({ element: lower.slice(start).join(" "), variant: front(tokens.slice(start), tokens.slice(0, start)) });
  return out;
}

export function checkFrontedVariant(ctx: RuleContext): Problem[] {
  const problems: Problem[] = [];
  const verbs = new Set<string>();
  const nouns = new Set<string>();
  for (const { item } of ctx.bank.values()) (item.pos === "verb" ? verbs : nouns).add(item.word.toLowerCase());
  const bankVerbs = new Set([...verbs].filter((v) => !nouns.has(v) && !v.includes(" ")));
  for (const { file, sections } of ctx.units) {
    for (const section of sections) {
      for (const ex of section.exercises) {
        const sentences = ex.type === "arrange_words" ? [ex.answer, ...(ex.accept ?? [])] : ex.type === "translate_th_en" ? ex.accept : [];
        if (sentences.length === 0) continue;
        const have = new Set(sentences.map(norm));
        const missing: { from: string; element: string; variant: string }[] = [];
        for (const sentence of sentences) {
          for (const v of frontedVariants(sentence, bankVerbs)) {
            if (!have.has(norm(v.variant)) && !missing.some((m) => norm(m.variant) === norm(v.variant))) missing.push({ from: sentence, ...v });
          }
        }
        if (missing.length === 0) continue;
        problems.push({
          rule: FRONTED_VARIANT_RULE, file, id: ex.id, severity: "warning",
          message: `"${missing[0].from}" can also start with "${missing[0].element}", but ${missing.map((m) => `"${m.variant}"`).join(", ")} ${missing.length === 1 ? "is" : "are"} not in accept, so a learner who writes ${missing.length === 1 ? "it" : "them"} is marked wrong. Add ${missing.map((m) => `"${m.variant}"`).join(", ")} to accept${ex.type === "arrange_words" ? " (the same tiles build it)" : ""}.`,
        });
      }
    }
  }
  return problems;
}
