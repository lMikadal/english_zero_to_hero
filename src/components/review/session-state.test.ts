import { describe, expect, it } from "vitest";
import { REQUEUE_GAP, SIBLING_GAP } from "@/lib/srs/config";
import { toWire } from "@/lib/srs/contract";
import { ratingIntervalLabels } from "@/lib/srs/format";
import { cardKey } from "@/lib/srs/queue";
import { applyRating, previewRatings, type Rating } from "@/lib/srs/scheduler";
import { createSession, sessionReducer, type SessionState } from "./session-state";
import { NOW, TZ, makeQueue, newState, reviewState, type CardSpec } from "./test-helpers";

const keys = (s: SessionState) => s.queue.map(cardKey);
const run = (s: SessionState, ...ratings: Rating[]) =>
  ratings.reduce((st, r) => sessionReducer(sessionReducer(st, { type: "reveal", now: NOW }), { type: "rate", rating: r, now: NOW }), s);

describe("session state", () => {
  it("starts on the front of the first card with n = number of cards", () => {
    const s = createSession(makeQueue([["country", "en_th"], ["friend", "en_th"], ["water", "th_en"]]));
    expect(s).toMatchObject({ phase: "playing", side: "front", total: 3 });
    expect(keys(s)).toEqual(["v-country|en_th", "v-friend|en_th", "v-water|th_en"]);
  });

  it("an empty queue is complete at once", () => {
    expect(createSession(makeQueue([])).phase).toBe("complete");
  });

  it("reveal turns the card over and remembers the moment (the previews are computed for it)", () => {
    const s = sessionReducer(createSession(makeQueue([["country", "en_th"]])), { type: "reveal", now: NOW });
    expect(s.side).toBe("back");
    expect(s.revealedAt).toEqual(NOW);
  });

  it("a rating that moves the card past today removes it; the last one completes the session", () => {
    const s = run(createSession(makeQueue([["country", "en_th"], ["friend", "en_th"]])), 3);
    expect(keys(s)).toEqual(["v-friend|en_th"]);
    expect(s.side).toBe("front");
    const end = run(s, 4);
    expect(end.phase).toBe("complete");
    expect(end.counts).toEqual({ 1: 0, 2: 0, 3: 1, 4: 1 });
  });

  it("Again puts the card back after REQUEUE_GAP others, with its new state; n does not grow", () => {
    const specs: CardSpec[] = [["country", "en_th"], ["friend", "en_th"], ["water", "en_th"], ["hello", "en_th"], ["book", "en_th"]];
    const q = makeQueue(specs);
    const s = run(createSession(q), 1);
    expect(s.total).toBe(5);
    expect(keys(s)).toHaveLength(5);
    expect(keys(s)[REQUEUE_GAP]).toBe("v-country|en_th");
    const back = s.queue[REQUEUE_GAP];
    expect(back.state).toEqual(applyRating(reviewState("2026-11-27T03:00:00Z"), 1, NOW, TZ));
    expect(s.counts[1]).toBe(1);
  });

  it("a returning card keeps the siblings apart (plan 2.3, rule 11a)", () => {
    const specs: CardSpec[] = [["country", "en_th"], ["friend", "en_th"], ["water", "en_th"], ["hello", "en_th"], ["book", "en_th"], ["friend", "th_en"], ["water", "th_en"], ["country", "th_en"]];
    const s = run(createSession(makeQueue(specs)), 1);
    const at = (k: string) => keys(s).indexOf(k);
    expect(Math.abs(at("v-country|en_th") - at("v-country|th_en"))).toBeGreaterThanOrEqual(SIBLING_GAP);
  });

  it("the end of today is the one the server sent, not recomputed", () => {
    // Due 3 minutes before the server's end of today: still due today. One minute after: not.
    const near = reviewState("2026-11-27T03:00:00Z");
    const rated = applyRating(near, 3, NOW, TZ);
    const same = createSession(makeQueue([["country", "en_th"], ["friend", "en_th"]], { endOfToday: new Date(rated.due.getTime() + 60_000).toISOString() }));
    expect(keys(run(same, 3))).toContain("v-country|en_th");
    const later = createSession(makeQueue([["country", "en_th"], ["friend", "en_th"]], { endOfToday: new Date(rated.due.getTime() - 60_000).toISOString() }));
    expect(keys(run(later, 3))).not.toContain("v-country|en_th");
  });

  it("remembers what the last rating did, for the live region", () => {
    const s = run(createSession(makeQueue([["country", "en_th"], ["friend", "en_th"]])), 1);
    expect(s.last).toMatchObject({ rating: 1, interval: "10 นาที", again: true });
    const t = run(s, 3);
    expect(t.last?.rating).toBe(3);
    expect(t.last?.again).toBe(false);
  });

  it("ignores a rating before the card was revealed, and a reveal when nothing is left", () => {
    const s = createSession(makeQueue([["country", "en_th"]]));
    expect(sessionReducer(s, { type: "rate", rating: 3, now: NOW })).toBe(s);
    const done = run(s, 4);
    expect(sessionReducer(done, { type: "reveal", now: NOW })).toBe(done);
  });
});

// docs/plans/vocab-review-plan.md 4.4 item 13 (PR 4): the zone comes from the server, and the server's card wins.
describe("the zone and the server's card", () => {
  /** A fake server: applyRating from the stored state with the learner's profile zone, answers the wire card. */
  const fakeServer = (stored = reviewState("2026-11-27T03:00:00Z")) => (rating: Rating, reviewedAt: Date, zone: string) => toWire(applyRating(stored, rating, reviewedAt, zone));

  it.each(["Asia/Bangkok", "America/Los_Angeles", "Pacific/Auckland", "UTC"])("the client's card after a rating equals the server's for the same inputs (zone %s)", (zone) => {
    for (const r of [1, 2, 3, 4] as Rating[]) {
      const q = makeQueue([["country", "en_th"], ["friend", "en_th"]], { timeZone: zone });
      const s = run(createSession(q), r);
      const mine = r === 1 ? s.queue.find((c) => c.vocabId === "v-country")! : null;
      const expected = fakeServer()(r, NOW, zone);
      if (mine) expect(toWire(mine.state)).toEqual(expected);
      // the preview shown under the button is the same calculation
      const state = createSession(q).queue[0].state;
      expect(previewRatings(state, NOW, zone)[r]).toEqual(applyRating(state, r, NOW, zone));
      expect(toWire(previewRatings(state, NOW, zone)[r])).toEqual(expected);
    }
  });

  it("the zone matters: a review at 06:30 Bangkok is the next day there but the same UTC day (so the test above has teeth)", () => {
    const last = new Date("2026-01-01T05:00:00Z"); // 12:00 in Bangkok
    const state = { ...reviewState("2026-01-01T05:00:00Z"), stability: 3, difficulty: 5, scheduledDays: 3, elapsedDays: 3, reps: 4, lastReview: last };
    const at = new Date("2026-01-01T23:30:00Z");
    expect(applyRating(state, 3, at, "Asia/Bangkok").elapsedDays).toBe(1);
    expect(applyRating(state, 3, at, "UTC").elapsedDays).toBe(0);
  });

  it("the labels use ReviewQueue.timeZone", () => {
    const q = makeQueue([["country", "en_th"]], { timeZone: "America/Los_Angeles" });
    const s = sessionReducer(createSession(q), { type: "reveal", now: NOW });
    expect(s.queue[0].state).toEqual(createSession(q).queue[0].state);
    expect(s.timeZone).toBe("America/Los_Angeles");
    expect(ratingIntervalLabels(s.queue[0].state, NOW, s.timeZone)).toEqual(ratingIntervalLabels(s.queue[0].state, NOW, "America/Los_Angeles"));
  });

  it("a card from the server replaces the local card of that key, before any later preview", () => {
    const q = makeQueue([["country", "en_th"], ["friend", "en_th"], ["water", "en_th"], ["hello", "en_th"], ["book", "en_th"]]);
    const s = run(createSession(q), 1);
    const local = s.queue.find((c) => c.vocabId === "v-country")!;
    const fromServer = toWire({ ...local.state, stability: local.state.stability + 1.25, reps: local.state.reps + 5 });
    const t = sessionReducer(s, { type: "server", key: "v-country|en_th", card: fromServer });
    expect(t.queue.find((c) => c.vocabId === "v-country")!.state).toEqual({ ...local.state, stability: local.state.stability + 1.25, reps: local.state.reps + 5 });
    expect(t.queue.filter((c) => c.vocabId !== "v-country")).toEqual(s.queue.filter((c) => c.vocabId !== "v-country"));
  });

  it("a server card that is due today for a card the client thought was finished puts it back (the server decides)", () => {
    const s = run(createSession(makeQueue([["country", "en_th"], ["friend", "en_th"], ["water", "en_th"]])), 3);
    expect(keys(s)).not.toContain("v-country|en_th");
    const t = sessionReducer(s, { type: "server", key: "v-country|en_th", card: toWire(newState("2026-11-27T05:10:00Z")) });
    expect(keys(t)).toContain("v-country|en_th");
    expect(t.queue.find((c) => c.vocabId === "v-country")!.state.due).toEqual(new Date("2026-11-27T05:10:00Z"));
    expect(t.total).toBe(3);
  });

  it("a server card that is not due today takes the card out; the last one completes the session", () => {
    const s = run(createSession(makeQueue([["country", "en_th"]])), 1);
    expect(s.phase).toBe("playing");
    const t = sessionReducer(s, { type: "server", key: "v-country|en_th", card: toWire(newState("2026-12-05T05:00:00Z")) });
    expect(t.queue).toEqual([]);
    expect(t.phase).toBe("complete");
  });

  it("a server card for a card that is finished and not due today changes nothing; after completion nothing comes back", () => {
    const s = run(createSession(makeQueue([["country", "en_th"]])), 4);
    expect(s.phase).toBe("complete");
    expect(sessionReducer(s, { type: "server", key: "v-country|en_th", card: toWire(newState("2026-11-27T05:10:00Z")) })).toBe(s);
    expect(sessionReducer(s, { type: "server", key: "v-unknown|en_th", card: toWire(newState()) })).toBe(s);
  });

  it("drop removes a card for good, resets the side if it was on screen, and leaves a notice", () => {
    const s = sessionReducer(createSession(makeQueue([["country", "en_th"], ["friend", "en_th"]])), { type: "reveal", now: NOW });
    const t = sessionReducer(s, { type: "drop", key: "v-country|en_th" });
    expect(keys(t)).toEqual(["v-friend|en_th"]);
    expect(t.side).toBe("front");
    expect(t.notice).toBe("บันทึกใบนี้ไม่ได้ จึงข้ามไป");
    expect(sessionReducer(t, { type: "drop", key: "v-country|en_th" })).toBe(t);
    expect(sessionReducer(t, { type: "drop", key: "v-friend|en_th" }).phase).toBe("complete");
  });

  it("a notice is cleared by the next rating", () => {
    const s = sessionReducer(createSession(makeQueue([["country", "en_th"], ["friend", "en_th"], ["water", "en_th"]])), { type: "drop", key: "v-country|en_th" });
    expect(run(s, 3).notice).toBeNull();
  });
});

// docs/plans/vocab-review-plan.md 2.4 (PR 5): "still due today" is decided against the local day of the session's FIRST answer.
describe("the midnight edge", () => {
  // Bangkok: loaded 23:58 on 27 Nov (16:58Z), the payload's end of today is 00:00 on 28 Nov (17:00Z)
  const LOAD_END = "2026-11-27T17:00:00.000Z";
  const earlyDue = () => reviewState("2026-11-27T10:00:00Z");
  const at = (iso: string) => new Date(iso);
  const answer = (s: SessionState, rating: Rating, now: Date) => sessionReducer(sessionReducer(s, { type: "reveal", now }), { type: "rate", rating, now });

  it("loaded before midnight, first answer after it: a card that was forgotten comes back (the server's day is the new day)", () => {
    const s = createSession(makeQueue([["country", "en_th", earlyDue()], ["friend", "en_th", earlyDue()]], { endOfToday: LOAD_END }));
    const t = answer(s, 1, at("2026-11-27T17:01:00Z")); // 00:01 on 28 Nov, +10 minutes is after the payload's end
    expect(keys(t)).toContain("v-country|en_th");
    expect(t.phase).toBe("playing");
  });

  it("the normal case is unchanged: a forgotten card comes back, a card that passed today's end does not", () => {
    const s = createSession(makeQueue([["country", "en_th", earlyDue()], ["friend", "en_th", earlyDue()]], { endOfToday: LOAD_END }));
    expect(keys(answer(s, 1, at("2026-11-27T10:05:00Z")))).toContain("v-country|en_th");
    expect(keys(answer(s, 3, at("2026-11-27T10:05:00Z")))).not.toContain("v-country|en_th");
  });

  it("the day is fixed by the FIRST answer: a later answer after midnight does not move it", () => {
    const s = createSession(makeQueue([["country", "en_th", earlyDue()], ["friend", "en_th", earlyDue()], ["water", "en_th", earlyDue()]], { endOfToday: LOAD_END }));
    const t = answer(answer(s, 3, at("2026-11-27T10:00:00Z")), 1, at("2026-11-27T17:01:00Z")); // second answer is on the next day
    expect(keys(t)).not.toContain("v-friend|en_th"); // its next due (00:11 on the 28th) is past the end of the FIRST answer's day (27th)
  });

  it("the end of the day uses ReviewQueue.timeZone, not UTC or the device's", () => {
    // Auckland (+13 in November): loaded at 23:58 on the 27th (10:58Z), the first answer at 00:05 on the 28th (11:05Z).
    // Its day ends at 11:00Z on the 28th; in UTC the same instant's day would end at 00:00Z on the 28th.
    const s = createSession(makeQueue([["country", "en_th", earlyDue()], ["friend", "en_th", earlyDue()], ["water", "en_th", earlyDue()]], { timeZone: "Pacific/Auckland", endOfToday: "2026-11-27T11:00:00.000Z" }));
    const t = answer(s, 3, at("2026-11-27T11:05:00Z"));
    const fromServer = sessionReducer(t, { type: "server", key: "v-friend|en_th", card: toWire(newState("2026-11-28T05:00:00Z")) }); // 18:00 on the 28th in Auckland
    expect(keys(fromServer)).toContain("v-friend|en_th");
    expect(keys(sessionReducer(t, { type: "server", key: "v-friend|en_th", card: toWire(newState("2026-11-28T11:30:00Z")) }))).not.toContain("v-friend|en_th"); // past that day's end
  });

  it("before the first answer the payload's end of today decides (a server card)", () => {
    const s = createSession(makeQueue([["country", "en_th", earlyDue()], ["friend", "en_th", earlyDue()]], { endOfToday: LOAD_END }));
    const due = toWire(newState("2026-11-27T17:30:00Z"));
    const t = sessionReducer(s, { type: "server", key: "v-country|en_th", card: due });
    expect(keys(t)).not.toContain("v-country|en_th");
  });
});

describe("a dropped card", () => {
  it("asks for focus on the heading only when the dropped card was on screen with its back showing", () => {
    const s = createSession(makeQueue([["country", "en_th"], ["friend", "en_th"]]));
    const back = sessionReducer(s, { type: "reveal", now: NOW });
    expect(sessionReducer(back, { type: "drop", key: "v-country|en_th" }).refocus).toBe(back.refocus + 1);
    expect(sessionReducer(s, { type: "drop", key: "v-country|en_th" }).refocus).toBe(s.refocus); // front: the reveal button is still there
    expect(sessionReducer(back, { type: "drop", key: "v-friend|en_th" }).refocus).toBe(back.refocus); // not on screen
  });
});
