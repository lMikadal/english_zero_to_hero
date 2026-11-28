import { describe, expect, it } from "vitest";
import { sittingSavedToday } from "./retake";

const Z = (iso: string) => new Date(iso);

describe("sittingSavedToday (D4: the next sitting of a checkpoint is for the next calendar day)", () => {
  it("is false with no sitting", () => {
    expect(sittingSavedToday([], Z("2026-11-28T10:00:00Z"), "Asia/Bangkok")).toBe(false);
  });

  it("is true for a sitting saved earlier on the same local date, false for the day before", () => {
    expect(sittingSavedToday([Z("2026-11-28T02:00:00Z")], Z("2026-11-28T10:00:00Z"), "Asia/Bangkok")).toBe(true);
    expect(sittingSavedToday([Z("2026-11-27T10:00:00Z")], Z("2026-11-28T10:00:00Z"), "Asia/Bangkok")).toBe(false);
  });

  it("any one sitting of the list is enough", () => {
    expect(sittingSavedToday([Z("2026-11-20T10:00:00Z"), Z("2026-11-28T03:00:00Z")], Z("2026-11-28T10:00:00Z"), "Asia/Bangkok")).toBe(true);
  });

  it("the date changes at local midnight, not at UTC midnight (Bangkok is UTC+7: 16:59:59Z is still the 28th, 17:00:00Z is the 29th)", () => {
    const saved = [Z("2026-11-28T16:59:59Z")];
    expect(sittingSavedToday(saved, Z("2026-11-28T16:59:59Z"), "Asia/Bangkok")).toBe(true);
    expect(sittingSavedToday(saved, Z("2026-11-28T17:00:00Z"), "Asia/Bangkok")).toBe(false);
    // the same two instants in New York are the same date
    expect(sittingSavedToday(saved, Z("2026-11-28T17:00:00Z"), "America/New_York")).toBe(true);
  });

  it("the zone decides: two instants 3 hours apart are one day in one zone and two in another", () => {
    const saved = [Z("2026-11-28T16:00:00Z")];
    const now = Z("2026-11-28T19:00:00Z");
    expect(sittingSavedToday(saved, now, "Asia/Bangkok")).toBe(false); // 23:00 on the 28th vs 02:00 on the 29th
    expect(sittingSavedToday(saved, now, "UTC")).toBe(true);
  });

  it("a zone that is not valid falls back to Asia/Bangkok instead of throwing", () => {
    expect(sittingSavedToday([Z("2026-11-28T02:00:00Z")], Z("2026-11-28T10:00:00Z"), "Not/AZone")).toBe(true);
  });
});
