import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerHome } from "@/db/queries/home";
import Home, { dynamic } from "./page";

const query = vi.hoisted(() => ({ result: null as unknown as LearnerHome | Error }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/server/current-user", () => ({ getCurrentUserId: async () => "local" }));
vi.mock("@/db/queries/home", () => ({
  getLearnerHome: async () => {
    if (query.result instanceof Error) throw query.result;
    return query.result;
  },
}));

const fresh: LearnerHome = { currentDay: 1, streak: { current: 0, longest: 0 }, activeToday: false, courseComplete: false };
const show = async () => render(await Home());

describe("Home page", () => {
  beforeEach(() => {
    query.result = fresh;
  });

  it("renders the app name as the h1", async () => {
    await show();
    expect(screen.getByRole("heading", { level: 1, name: "English Zero to Hero" })).toBeInTheDocument();
  });

  it("shows a Thai tagline", async () => {
    await show();
    expect(screen.getByText(/ฝึกภาษาอังกฤษ/)).toBeInTheDocument();
  });

  it("shows the current day out of 365 and one primary start button linking to that day", async () => {
    query.result = { ...fresh, currentDay: 4, streak: { current: 3, longest: 5 } };
    await show();
    expect(screen.getByText("วันที่ 4 / 365")).toBeInTheDocument();
    const start = screen.getByRole("link", { name: "เริ่มบทเรียนวันที่ 4" });
    expect(start).toHaveAttribute("href", "/day/4");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("shows the current streak", async () => {
    query.result = { ...fresh, currentDay: 2, streak: { current: 3, longest: 5 }, activeToday: true };
    await show();
    expect(screen.getByText(/สตรีค 3 วัน/)).toBeInTheDocument();
    expect(screen.getByText(/วันนี้เรียนแล้ว/)).toBeInTheDocument();
  });

  it("does not claim today is done when it is not", async () => {
    await show();
    expect(screen.queryByText(/วันนี้เรียนแล้ว/)).not.toBeInTheDocument();
    expect(screen.getByText(/สตรีค 0 วัน/)).toBeInTheDocument();
  });

  it("after day 365 is done shows a completion message instead of the start button", async () => {
    query.result = { currentDay: 365, streak: { current: 40, longest: 90 }, activeToday: true, courseComplete: true };
    await show();
    expect(screen.getByText(/เรียนครบ 365 วันแล้ว/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /เริ่มบทเรียน/ })).not.toBeInTheDocument();
  });

  it("shows the Thai database-error screen when the database is down", async () => {
    query.result = new Error("connect ECONNREFUSED");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await show();
    expect(screen.getByRole("alert")).toHaveTextContent("เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("is rendered on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
