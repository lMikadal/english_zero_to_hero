// Generates src/lib/srs/scheduler.golden.vectors.ts from ts-fsrs ITSELF (DefaultScheduler, FSRS-6), not from our
// adapter, so the golden test compares the adapter against the library.
// Run (Docker only):  docker compose run --rm --no-deps app node scripts/srs-golden.mjs > src/lib/srs/scheduler.golden.vectors.ts
// Re-run it, and read the diff, whenever ts-fsrs is upgraded. The configuration below must equal SRS_CONFIG
// (src/lib/srs/config.ts); scheduler.test.ts pins both.
//
// Days: ts-fsrs counts a day as a difference of UTC calendar dates, so to count the learner's LOCAL days every instant is
// shifted to "local wall-clock written as UTC" before it goes into the library; a due date of one day or more is
// mapped back to the same local wall-clock time, a due date of minutes is mapped back as the same duration. The
// time-zone helpers below are written separately from the adapter on purpose.
// elapsedDays is what the library itself used: scheduler.chrono.difference(lastReview, now) on the shifted dates.
import { DefaultScheduler } from "ts-fsrs";

const CONFIG = {
  version: "FSRS-6",
  desiredRetention: 0.9,
  enableShortTerm: true,
  learningSteps: ["1m", "10m"],
  relearningSteps: ["10m"],
  enableFuzz: false,
  maximumInterval: 36500,
};
const DAY = 86_400_000;
const EARLY_MS = 8 * 3_600_000;

const offsets = new Map();
function offsetMs(ms, tz) {
  if (tz === "UTC") return 0;
  let f = offsets.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    offsets.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
const shift = (d, tz) => new Date(d.getTime() + offsetMs(d.getTime(), tz));
function unshift(wall, tz) {
  let t = wall.getTime() - offsetMs(wall.getTime(), tz);
  t = wall.getTime() - offsetMs(t, tz);
  return new Date(t);
}
const localMs = (d, tz) => d.getTime() + offsetMs(d.getTime(), tz);

const SEQUENCES = [
  { name: "good x4, on time", tz: "UTC", start: "2026-01-01T01:00:00.000Z", ratings: [3, 3, 3, 3] },
  { name: "lapse then recover: 1 3 3", tz: "UTC", start: "2026-01-01T01:00:00.000Z", ratings: [1, 3, 3] },
  { name: "easy x2", tz: "UTC", start: "2026-01-01T01:00:00.000Z", ratings: [4, 4] },
  { name: "good, lapse, good, good: 3 1 3 3", tz: "UTC", start: "2026-01-01T01:00:00.000Z", ratings: [3, 1, 3, 3] },
  { name: "good, good, then forgotten in Review state (relearning): 3 3 1 3 3", tz: "UTC", start: "2026-01-01T01:00:00.000Z", ratings: [3, 3, 1, 3, 3] },
  { name: "hard x2 then good", tz: "UTC", start: "2026-01-01T01:00:00.000Z", ratings: [2, 2, 3] },
  { name: "good x8, on time", tz: "UTC", start: "2026-01-01T01:00:00.000Z", ratings: [3, 3, 3, 3, 3, 3, 3, 3] },
  { name: "good x5, 8 hours early once the interval is 2+ days", tz: "UTC", start: "2026-01-01T01:00:00.000Z", ratings: [3, 3, 3, 3, 3], early: true },
  // the learner's local day, not the UTC day, is what counts (Bangkok is UTC+7: its day starts at 17:00 UTC)
  { name: "Asia/Bangkok: good x5, each review at 06:30 local on the due day (before the UTC midnight at 07:00 local)", tz: "Asia/Bangkok", start: "2026-01-01T05:00:00.000Z", ratings: [3, 3, 3, 3, 3], localTime: "06:30" },
  { name: "Asia/Bangkok: good x5, each review at 23:30 local on the due day", tz: "Asia/Bangkok", start: "2026-01-01T05:00:00.000Z", ratings: [3, 3, 3, 3, 3], localTime: "23:30" },
  { name: "Asia/Bangkok: 3 3 1 3 3 at 06:30 local", tz: "Asia/Bangkok", start: "2026-01-01T05:00:00.000Z", ratings: [3, 3, 1, 3, 3], localTime: "06:30" },
  { name: "America/Los_Angeles: good x6 across the March 2026 DST change, at the due instant", tz: "America/Los_Angeles", start: "2026-02-20T20:00:00.000Z", ratings: [3, 3, 3, 3, 3, 3] },
  { name: "America/Los_Angeles: easy x4 at 00:30 local on the due day (spring and autumn changes)", tz: "America/Los_Angeles", start: "2026-02-01T20:00:00.000Z", ratings: [4, 4, 4, 4], localTime: "00:30" },
  { name: "Pacific/Auckland: good x5 at 23:30 local (UTC+12/13)", tz: "Pacific/Auckland", start: "2026-01-01T05:00:00.000Z", ratings: [3, 3, 3, 3, 3], localTime: "23:30" },
];

const scheduler = await DefaultScheduler(CONFIG);

/** One review of a real-instant card, the way the adapter must do it. */
function review(card, grade, now, tz) {
  const lib = {
    stability: card.stability, difficulty: card.difficulty, state: card.state,
    scheduleStatus: card.state === 0 ? "new" : card.state === 2 ? "review" : "learning",
    dueAt: shift(card.due, tz), lastReviewAt: card.last ? shift(card.last, tz) : null, cardId: "g", reps: card.reps, lapses: card.lapses,
    scheduledDays: card.scheduledDays, learningStep: card.learningStep,
  };
  const nowShifted = shift(now, tz);
  const elapsedDays = lib.lastReviewAt ? scheduler.chrono.difference(lib.lastReviewAt, nowShifted) : 0;
  const next = scheduler.review({ card: lib, grade, now: nowShifted }).card;
  const due = next.scheduledDays >= 1 ? unshift(next.dueAt, tz) : new Date(now.getTime() + (next.dueAt.getTime() - nowShifted.getTime()));
  return {
    card: { stability: next.stability, difficulty: next.difficulty, state: next.state, due, last: now, reps: next.reps, lapses: next.lapses, scheduledDays: next.scheduledDays, learningStep: next.learningStep },
    elapsedDays,
  };
}

const out = [];
for (const seq of SEQUENCES) {
  const start = new Date(seq.start);
  let card = { stability: 0, difficulty: 0, state: 0, due: start, last: null, reps: 0, lapses: 0, scheduledDays: 0, learningStep: 0 };
  const steps = [];
  for (const rating of seq.ratings) {
    let now = new Date(card.due);
    if (steps.length === 0) now = start;
    else if (seq.early && card.scheduledDays >= 2) now = new Date(card.due.getTime() - EARLY_MS);
    else if (seq.localTime && card.scheduledDays >= 1) {
      const [h, m] = seq.localTime.split(":").map(Number);
      const dueLocalDay = Math.floor(localMs(card.due, seq.tz) / DAY) * DAY;
      now = unshift(new Date(dueLocalDay + h * 3_600_000 + m * 60_000), seq.tz);
    }
    const r = review(card, rating, now, seq.tz);
    card = r.card;
    steps.push({
      rating, now: now.toISOString(), due: card.due.toISOString(),
      stability: Number(card.stability.toFixed(4)), difficulty: Number(card.difficulty.toFixed(4)),
      state: card.state, scheduledDays: card.scheduledDays, learningSteps: card.learningStep, reps: card.reps, lapses: card.lapses, elapsedDays: r.elapsedDays,
    });
  }
  out.push({ name: seq.name, tz: seq.tz, start: seq.start, steps });
}
console.log("// GENERATED by scripts/srs-golden.mjs from ts-fsrs. Do not edit by hand; see the script header.");
console.log(`// config: ${JSON.stringify(CONFIG)}`);
console.log(`export type GoldenStep = { rating: 1 | 2 | 3 | 4; now: string; due: string; stability: number; difficulty: number; state: 0 | 1 | 2 | 3; scheduledDays: number; learningSteps: number; reps: number; lapses: number; elapsedDays: number };`);
console.log("export const GOLDEN_SEQUENCES: { name: string; tz: string; start: string; steps: GoldenStep[] }[] = [");
for (const { name, tz, start, steps } of out) {
  console.log(`  {\n    name: ${JSON.stringify(name)},\n    tz: ${JSON.stringify(tz)},\n    start: ${JSON.stringify(start)},\n    steps: [`);
  for (const s of steps) console.log(`      ${JSON.stringify(s).replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ").replace(/\{/, "{ ").replace(/\}$/, " }")},`);
  console.log("    ],\n  },");
}
console.log("];");
