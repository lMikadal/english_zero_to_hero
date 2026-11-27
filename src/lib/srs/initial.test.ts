import { describe, expect, expectTypeOf, it } from "vitest";
import { addDays, localDate, localMidnight } from "@/lib/progress/dates";
import { type ReviewDirection } from "./contract";
import { SIBLING_STAGGER_DAYS } from "./config";
import { initialDues } from "./initial";

const BKK = "Asia/Bangkok";
const LA = "America/Los_Angeles";
const iso = (d: Date) => d.toISOString();
const dues = (o: Parameters<typeof initialDues>[0], now: Date, tz: string) => {
  const r = initialDues(o, now, tz);
  return { en_th: iso(r.en_th), th_en: iso(r.th_en) };
};

describe("initialDues: finishing a lesson (first review the next day, th_en one day later)", () => {
  it("Asia/Bangkok: finished at 14:00 local", () => {
    const completedAt = new Date("2026-11-26T07:00:00Z"); // 14:00 Bangkok, 26 Nov
    expect(dues({ kind: "lesson", completedAt }, completedAt, BKK)).toEqual({
      en_th: "2026-11-26T17:00:00.000Z", // 00:00 on 27 Nov, Bangkok
      th_en: "2026-11-27T17:00:00.000Z", // 00:00 on 28 Nov
    });
  });
  it("Asia/Bangkok: 23:59 and 00:01 local fall on different days", () => {
    const late = new Date("2026-11-26T16:59:00Z"); // 23:59 on 26 Nov
    const early = new Date("2026-11-26T17:01:00Z"); // 00:01 on 27 Nov
    expect(dues({ kind: "lesson", completedAt: late }, late, BKK).en_th).toBe("2026-11-26T17:00:00.000Z");
    expect(dues({ kind: "lesson", completedAt: early }, early, BKK).en_th).toBe("2026-11-27T17:00:00.000Z");
  });
  it("America/Los_Angeles across the end of daylight saving time (2026-11-01, 25 hours)", () => {
    const completedAt = new Date("2026-10-31T20:00:00Z"); // 13:00 PDT on 31 Oct
    expect(dues({ kind: "lesson", completedAt }, completedAt, LA)).toEqual({
      en_th: "2026-11-01T07:00:00.000Z", // 00:00 PDT (UTC-7) on 1 Nov
      th_en: "2026-11-02T08:00:00.000Z", // 00:00 PST (UTC-8) on 2 Nov: the day has 25 hours
    });
  });
  it("America/Los_Angeles: 23:59 and 00:01 local", () => {
    const late = new Date("2026-11-27T07:59:00Z"); // 23:59 PST on 26 Nov
    const early = new Date("2026-11-27T08:01:00Z"); // 00:01 PST on 27 Nov
    expect(dues({ kind: "lesson", completedAt: late }, late, LA).en_th).toBe("2026-11-27T08:00:00.000Z");
    expect(dues({ kind: "lesson", completedAt: early }, early, LA).en_th).toBe("2026-11-28T08:00:00.000Z");
  });
  it("ignores `now` for a lesson origin (the server's completedAt decides)", () => {
    const completedAt = new Date("2026-11-26T07:00:00Z");
    expect(dues({ kind: "lesson", completedAt }, new Date("2030-01-01T00:00:00Z"), BKK)).toEqual(dues({ kind: "lesson", completedAt }, completedAt, BKK));
  });
  it.each([BKK, LA, "UTC", "Pacific/Auckland"])("th_en is exactly one calendar day after en_th in %s", (tz) => {
    for (const hour of [0, 5, 11, 17, 23]) {
      const completedAt = new Date(Date.UTC(2026, 2, 7, hour)); // around US/NZ DST changes
      const r = initialDues({ kind: "lesson", completedAt }, completedAt, tz);
      expect(localDate(r.th_en, tz)).toBe(addDays(localDate(r.en_th, tz), SIBLING_STAGGER_DAYS));
      expect(r.th_en.getTime()).toBe(localMidnight(addDays(localDate(r.en_th, tz), 1), tz).getTime());
    }
  });
});

describe("initialDues: backfill (a lesson finished before this feature existed)", () => {
  it("Asia/Bangkok: en_th is due now, th_en at the next local midnight", () => {
    const now = new Date("2026-11-26T07:00:00Z");
    expect(dues({ kind: "backfill" }, now, BKK)).toEqual({ en_th: "2026-11-26T07:00:00.000Z", th_en: "2026-11-26T17:00:00.000Z" });
  });
  it("America/Los_Angeles on the long DST day", () => {
    const now = new Date("2026-11-01T10:00:00Z"); // 02:00 PST... after the change, 1 Nov
    expect(dues({ kind: "backfill" }, now, LA)).toEqual({ en_th: "2026-11-01T10:00:00.000Z", th_en: "2026-11-02T08:00:00.000Z" });
  });
  it("returns a new Date for en_th, not the caller's", () => {
    const now = new Date("2026-11-26T07:00:00Z");
    expect(initialDues({ kind: "backfill" }, now, BKK).en_th).not.toBe(now);
  });
});

it("the result has a rule for every ReviewDirection", () => {
  expectTypeOf(initialDues({ kind: "backfill" }, new Date(0), BKK)).toEqualTypeOf<Record<ReviewDirection, Date>>();
});
