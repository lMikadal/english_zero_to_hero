import { describe, expect, it } from "vitest";
import { fromLocalWall, offsetMs, toLocalWall } from "./zone";

const H = 3_600_000;

describe("offsetMs", () => {
  it.each([
    ["UTC", "2026-06-01T00:00:00Z", 0],
    ["Asia/Bangkok", "2026-06-01T00:00:00Z", 7 * H],
    ["America/Los_Angeles", "2026-01-15T00:00:00Z", -8 * H],
    ["America/Los_Angeles", "2026-07-15T00:00:00Z", -7 * H],
    ["America/Los_Angeles", "2026-03-08T09:59:59Z", -8 * H], // the second before the change
    ["America/Los_Angeles", "2026-03-08T10:00:00Z", -7 * H],
    ["Pacific/Auckland", "2026-01-01T00:00:00Z", 13 * H],
    ["Asia/Kolkata", "2026-01-01T00:00:00Z", 5.5 * H],
  ])("%s at %s is %d ms", (tz, t, ms) => {
    expect(offsetMs(new Date(t).getTime(), tz)).toBe(ms);
  });
  it("keeps milliseconds out of the offset (the offset is a whole number of seconds)", () => {
    expect(offsetMs(new Date("2026-06-01T00:00:00.789Z").getTime(), "Asia/Bangkok")).toBe(7 * H);
  });
  it("an unknown zone falls back like the rest of the app (Asia/Bangkok)", () => {
    expect(offsetMs(0, "Not/AZone")).toBe(7 * H);
  });
});

describe("toLocalWall / fromLocalWall", () => {
  it("shows the local clock as if it were UTC", () => {
    expect(toLocalWall(new Date("2026-01-01T23:30:00Z"), "Asia/Bangkok").toISOString()).toBe("2026-01-02T06:30:00.000Z");
  });
  it.each(["UTC", "Asia/Bangkok", "America/Los_Angeles", "Pacific/Auckland", "Asia/Kolkata"])("round-trips every real instant in %s, also around DST changes", (tz) => {
    for (const start of ["2026-03-07T00:00:00Z", "2026-03-28T00:00:00Z", "2026-09-25T00:00:00Z", "2026-10-31T00:00:00Z"]) {
      for (let m = 0; m < 3 * 24 * 60; m += 7) {
        const t = new Date(new Date(start).getTime() + m * 60_000);
        // ambiguous wall times (clocks going back) may come back as the other of the two instants: the reading must match
        expect(toLocalWall(fromLocalWall(toLocalWall(t, tz), tz), tz).getTime()).toBe(toLocalWall(t, tz).getTime());
      }
    }
  });
  it("a non-existent wall time (02:30 on the spring-forward day in Los Angeles) maps to a real instant within an hour", () => {
    const wall = new Date("2026-03-08T02:30:00Z");
    const real = fromLocalWall(wall, "America/Los_Angeles");
    expect(Number.isNaN(real.getTime())).toBe(false);
    expect(Math.abs(real.getTime() - (wall.getTime() + 8 * H))).toBeLessThanOrEqual(H);
  });
});
