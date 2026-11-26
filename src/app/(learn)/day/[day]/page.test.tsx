import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DayPage from "./page";

// DayPlayer refreshes the router when a day is done; there is no app router in a unit test (notFound stays real)
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: () => {} }) }));
const getCurrentDay = vi.hoisted(() => vi.fn<() => Promise<number>>());
vi.mock("../../access", () => ({ getCurrentDay }));
const getLessonMock = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/content/repo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/content/repo")>();
  return { ...real, getLesson: (day: number) => { if (getLessonMock.fail) throw new Error("bad lesson file"); return real.getLesson(day); } };
});

const params = (day: string) => Promise.resolve({ day });
const show = async (day: string) => render(await DayPage({ params: params(day) }));

describe("day page", () => {
  beforeEach(() => {
    getCurrentDay.mockResolvedValue(365);
    getLessonMock.fail = false;
  });

  it.each(["0", "366", "abc", "1.5", "-1", "", "007", "01", "1000", "+1", " 1"])("calls notFound for day %j", async (day) => {
    await expect(DayPage({ params: params(day) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("renders the lesson player for an unlocked day", async () => {
    await show("1");
    expect(screen.getByText("ฟังและสังเกตรูปปาก")).toBeInTheDocument(); // first exercise of day 1
    expect(screen.getByText("ข้อ 1 / 10")).toBeInTheDocument();
  });

  it("shows the locked screen with a link to the current day for a later day", async () => {
    getCurrentDay.mockResolvedValue(2);
    await show("3");
    expect(screen.getByText(/ยังไม่ปลดล็อก/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ไปบทเรียนวันที่ 2/ })).toHaveAttribute("href", "/day/2");
    expect(screen.queryByText("ฟังและสังเกตรูปปาก")).not.toBeInTheDocument();
  });

  it("lets a finished day be replayed", async () => {
    getCurrentDay.mockResolvedValue(3);
    await show("2");
    expect(screen.queryByText(/ยังไม่ปลดล็อก/)).not.toBeInTheDocument();
    expect(screen.getByText(/ข้อ 1 \//)).toBeInTheDocument();
  });

  it("shows a friendly screen, not a crash, when the day has no lesson yet", async () => {
    await show("200");
    expect(screen.getByText("ยังไม่มีบทเรียนของวันนี้")).toBeInTheDocument();
  });

  it("checks the lock before looking for a lesson", async () => {
    getCurrentDay.mockResolvedValue(1);
    await show("200");
    expect(screen.getByText(/ยังไม่ปลดล็อก/)).toBeInTheDocument();
  });
});

describe("day page robustness", () => {
  it("shows the no-lesson screen instead of crashing when the lesson file is invalid", async () => {
    getCurrentDay.mockResolvedValue(365);
    getLessonMock.fail = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(await DayPage({ params: params("1") }));
    expect(screen.getByText("ยังไม่มีบทเรียนของวันนี้")).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    getLessonMock.fail = false;
  });

  it("shows the Thai database-error screen, not a crash, when the current day cannot be read", async () => {
    getCurrentDay.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(await DayPage({ params: params("1") }));
    expect(screen.getByText("เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง")).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("still answers 404 for a malformed day when the database is down", async () => {
    getCurrentDay.mockRejectedValue(new Error("down"));
    await expect(DayPage({ params: params("007") })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("is always rendered dynamically (the lock must never be cached)", async () => {
    const mod = await import("./page");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});
