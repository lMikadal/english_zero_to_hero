import { describe, expect, it } from "vitest";
import { clampTimestamp, MAX_PAST_MS, timestampFloor } from "./clamp";

const now = new Date("2026-11-25T10:00:00.000Z");
const iso = (d: Date) => d.toISOString();

describe("timestampFloor", () => {
  it("is 30 days back when the profile is older", () => {
    expect(iso(timestampFloor(now, "2026-01-01", "Asia/Bangkok"))).toBe(iso(new Date(now.getTime() - MAX_PAST_MS)));
  });
  it("is the start date at local midnight when the profile is newer", () => {
    expect(iso(timestampFloor(now, "2026-11-20", "Asia/Bangkok"))).toBe("2026-11-19T17:00:00.000Z");
  });
});

describe("clampTimestamp", () => {
  const floor = new Date("2026-11-19T17:00:00.000Z");
  it("keeps a timestamp inside the window", () => {
    expect(iso(clampTimestamp("2026-11-24T10:00:00+07:00", now, floor))).toBe("2026-11-24T03:00:00.000Z");
  });
  it("clamps the future to now (no allowance)", () => {
    expect(iso(clampTimestamp("2026-11-25T10:00:01Z", now, floor))).toBe(iso(now));
    expect(iso(clampTimestamp("2099-01-01T00:00:00Z", now, floor))).toBe(iso(now));
  });
  it("clamps the past to the floor", () => {
    expect(iso(clampTimestamp("1970-01-01T00:00:00Z", now, floor))).toBe(iso(floor));
    expect(iso(clampTimestamp("1900-01-01T00:00:00Z", now, floor))).toBe(iso(floor));
  });
});
