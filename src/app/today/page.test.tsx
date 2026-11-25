import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TodayPage, { dynamic } from "./page";

const access = vi.hoisted(() => ({ day: 3 as number | Error }));
vi.mock("../(learn)/access", () => ({
  getCurrentDay: async () => {
    if (access.day instanceof Error) throw access.day;
    return access.day;
  },
}));

describe("/today", () => {
  it("redirects to the learner's current day", async () => {
    access.day = 3;
    await expect(TodayPage()).rejects.toMatchObject({ digest: expect.stringMatching(/NEXT_REDIRECT.*\/day\/3/) });
  });

  it("shows the Thai database-error screen when the database is down", async () => {
    access.day = new Error("down");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(await TodayPage());
    expect(screen.getByRole("alert")).toHaveTextContent("เชื่อมต่อฐานข้อมูลไม่ได้");
    error.mockRestore();
  });

  it("is rendered on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
