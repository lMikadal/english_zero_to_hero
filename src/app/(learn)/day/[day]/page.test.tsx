import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DayPage from "./page";

const getCurrentDay = vi.hoisted(() => vi.fn<() => Promise<number>>());
vi.mock("../../access", () => ({ getCurrentDay }));

const params = (day: string) => Promise.resolve({ day });
const show = async (day: string) => render(await DayPage({ params: params(day) }));

describe("day page", () => {
  beforeEach(() => getCurrentDay.mockResolvedValue(365));

  it.each(["0", "366", "abc", "1.5", "-1", ""])("calls notFound for day %j", async (day) => {
    await expect(DayPage({ params: params(day) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("renders the lesson player for an unlocked day", async () => {
    await show("1");
    expect(screen.getByText("ฟังและสังเกตรูปปาก")).toBeInTheDocument(); // first exercise of day 1
    expect(screen.getByText("ข้อ 1 / 11")).toBeInTheDocument();
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
