import { describe, expect, it } from "vitest";
import { addDays, daysBetween, localDate } from "./dates";

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
