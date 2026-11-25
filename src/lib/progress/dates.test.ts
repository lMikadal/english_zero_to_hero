import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isValidTimeZone, localDate } from "./dates";

describe("localDate", () => {
  it("uses the calendar date in the given IANA time zone", () => {
    const t = new Date("2026-03-01T18:00:00Z"); // 01:00 on 2 Mar in Bangkok (UTC+7)
    expect(localDate(t, "Asia/Bangkok")).toBe("2026-03-02");
    expect(localDate(t, "UTC")).toBe("2026-03-01");
    expect(localDate(t, "America/Los_Angeles")).toBe("2026-03-01");
  });

  it("flips exactly at local midnight", () => {
    expect(localDate(new Date("2026-03-01T16:59:59.999Z"), "Asia/Bangkok")).toBe("2026-03-01");
    expect(localDate(new Date("2026-03-01T17:00:00Z"), "Asia/Bangkok")).toBe("2026-03-02");
  });
});

describe("daysBetween / addDays", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
    expect(daysBetween("2026-01-01", "2026-03-01")).toBe(59);
    expect(daysBetween("2026-03-01", "2026-01-01")).toBe(-59);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("time zones", () => {
  it("falls back to Asia/Bangkok for an invalid or empty zone instead of throwing", () => {
    const t = new Date("2026-03-01T18:00:00Z");
    expect(localDate(t, "Asia/Bankok")).toBe("2026-03-02");
    expect(localDate(t, "")).toBe("2026-03-02");
  });

  it("validates zones for the settings screen", () => {
    expect(isValidTimeZone("Asia/Bangkok")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Asia/Bankok")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("handles the spring-forward day in New York (2026-03-08)", () => {
    const ny = "America/New_York";
    expect(localDate(new Date("2026-03-08T06:59:00Z"), ny)).toBe("2026-03-08"); // 01:59 EST
    expect(localDate(new Date("2026-03-08T07:00:00Z"), ny)).toBe("2026-03-08"); // 03:00 EDT
    expect(localDate(new Date("2026-03-09T03:59:00Z"), ny)).toBe("2026-03-08"); // 23:59 EDT
    expect(localDate(new Date("2026-03-09T04:00:00Z"), ny)).toBe("2026-03-09");
  });

  it("handles the fall-back day in New York (2026-11-01)", () => {
    const ny = "America/New_York";
    expect(localDate(new Date("2026-11-01T05:00:00Z"), ny)).toBe("2026-11-01"); // 01:00 EDT
    expect(localDate(new Date("2026-11-01T06:30:00Z"), ny)).toBe("2026-11-01"); // 01:30 EST
    expect(localDate(new Date("2026-11-02T04:59:00Z"), ny)).toBe("2026-11-01"); // 23:59 EST
    expect(localDate(new Date("2026-11-02T05:00:00Z"), ny)).toBe("2026-11-02");
  });

  it("flips at local midnight in a negative-offset zone", () => {
    const la = "America/Los_Angeles";
    expect(localDate(new Date("2026-06-15T06:59:59Z"), la)).toBe("2026-06-14");
    expect(localDate(new Date("2026-06-15T07:00:00Z"), la)).toBe("2026-06-15");
  });

  it("counts a leap day", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});
