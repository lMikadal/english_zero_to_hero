import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TodayPage, { dynamic } from "./page";

const access = vi.hoisted(() => ({ day: 3 as number | Error, blocking: null as number | null }));
vi.mock("../(learn)/access", () => ({
  getCurrentDay: async () => {
    if (access.day instanceof Error) throw access.day;
    return access.day;
  },
  getGate: async () => {
    if (access.day instanceof Error) throw access.day;
    return { currentDay: access.day, blocking: access.blocking, playableDay: access.blocking === null ? access.day : access.day - 1 };
  },
}));

describe("/today", () => {
  it("redirects to the learner's current day", async () => {
    access.day = 3;
    await expect(TodayPage()).rejects.toMatchObject({ digest: expect.stringMatching(/NEXT_REDIRECT.*\/day\/3/) });
  });

  it("while a checkpoint blocks the next day it redirects to that checkpoint (D10)", async () => {
    access.day = 31;
    access.blocking = 30;
    await expect(TodayPage()).rejects.toMatchObject({ digest: expect.stringMatching(/NEXT_REDIRECT.*\/checkpoint\/30/) });
    access.blocking = null;
  });

  it("D15 / no file: not blocked means the current day, exactly as before", async () => {
    access.day = 35;
    access.blocking = null;
    await expect(TodayPage()).rejects.toMatchObject({ digest: expect.stringMatching(/NEXT_REDIRECT.*\/day\/35/) });
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
