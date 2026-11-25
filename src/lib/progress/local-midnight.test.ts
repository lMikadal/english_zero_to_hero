import { describe, expect, it } from "vitest";
import { localMidnight } from "./dates";

describe("localMidnight", () => {
  it("is the first instant of the calendar date in the zone", () => {
    expect(localMidnight("2026-11-26", "Asia/Bangkok").toISOString()).toBe("2026-11-25T17:00:00.000Z");
    expect(localMidnight("2026-11-26", "UTC").toISOString()).toBe("2026-11-26T00:00:00.000Z");
    expect(localMidnight("2026-11-26", "America/Los_Angeles").toISOString()).toBe("2026-11-26T08:00:00.000Z");
    expect(localMidnight("2026-11-26", "Pacific/Kiritimati").toISOString()).toBe("2026-11-25T10:00:00.000Z");
    expect(localMidnight("2026-11-26", "Asia/Kolkata").toISOString()).toBe("2026-11-25T18:30:00.000Z");
  });
  it("falls back to Asia/Bangkok for a bad zone", () => {
    expect(localMidnight("2026-11-26", "Nope/Zone").toISOString()).toBe("2026-11-25T17:00:00.000Z");
  });
});
