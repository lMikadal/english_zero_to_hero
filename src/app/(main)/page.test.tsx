import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerHome } from "@/db/queries/home";
import Home, { dynamic } from "./page";

const lessonFor = vi.hoisted(() => ({ missing: false }));
const query = vi.hoisted(() => ({ result: null as unknown as LearnerHome | Error }));
vi.mock("@/components/player/UnsavedNote", () => ({ UnsavedNote: () => <p>unsaved-note</p> }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/content/repo", () => ({
  getLesson: (day: number) => {
    if (lessonFor.missing || day > 7) return null;
    return { day, phase: 1, cefr: "A1", title: { en: "How are you?", th: "ทักทายและถามสารทุกข์สุกดิบ" } };
  },
}));
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
    lessonFor.missing = false;
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
    expect(screen.getByRole("heading", { level: 2, name: "วันที่ 4 / 365" })).toBeInTheDocument();
    const start = screen.getByRole("link", { name: "เริ่มบทเรียนวันที่ 4" });
    expect(start).toHaveAttribute("href", "/day/4");
    // the start button is the only link on the page: settings is reached through the main nav (layout)
    expect(screen.getAllByRole("link")).toEqual([start]);
  });

  it("has no settings gear (the main nav in the layout reaches ตั้งค่า)", async () => {
    await show();
    expect(screen.queryByRole("link", { name: "ตั้งค่า" })).not.toBeInTheDocument();
  });

  it("shows today's lesson title (English under lang=en, Thai), phase and level from the content", async () => {
    await show();
    expect(screen.getByText("How are you?")).toHaveAttribute("lang", "en");
    expect(screen.getByText("ทักทายและถามสารทุกข์สุกดิบ")).toBeInTheDocument();
    expect(screen.getByText("เฟส 1 · A1")).toBeInTheDocument();
  });

  it("still shows the day and the start button when the lesson file is missing, without inventing a title", async () => {
    lessonFor.missing = true;
    query.result = { ...fresh, currentDay: 30 };
    await show();
    expect(screen.getByRole("link", { name: "เริ่มบทเรียนวันที่ 30" })).toBeInTheDocument();
    expect(screen.queryByText("How are you?")).not.toBeInTheDocument();
  });

  it("shows course progress as days finished out of 365", async () => {
    query.result = { ...fresh, currentDay: 4 };
    await show();
    const bar = screen.getByRole("progressbar", { name: "เรียนแล้ว" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "365");
  });

  it("shows no data the app does not have (words learned, last score, weak spots, level)", async () => {
    await show();
    for (const t of [/คำที่เรียนแล้ว/, /คะแนน/, /ควรฝึก/, /ระดับโดยประมาณ/, /ถึงกำหนด/]) expect(screen.queryByText(t)).not.toBeInTheDocument();
  });

  it("shows the current streak", async () => {
    query.result = { ...fresh, currentDay: 2, streak: { current: 3, longest: 5 }, activeToday: true };
    await show();
    expect(screen.getByText("สตรีคต่อเนื่อง").closest("div")).toHaveTextContent("3 วัน");
    expect(screen.getByText("สตรีคนานที่สุด").closest("div")).toHaveTextContent("5 วัน");
    expect(screen.getByText(/วันนี้เรียนแล้ว/)).toBeInTheDocument();
  });

  it("does not claim today is done when it is not", async () => {
    await show();
    expect(screen.queryByText(/วันนี้เรียนแล้ว/)).not.toBeInTheDocument();
    expect(screen.getByText("สตรีคต่อเนื่อง").closest("div")).toHaveTextContent("0 วัน");
  });

  it("keeps Thai out of lang=en and English out of the Thai lang", async () => {
    await show();
    expect(document.querySelectorAll("[lang='en']")).toHaveLength(1);
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

  it("includes the unsaved-answers note (it renders only while the in-memory queue has pending items)", async () => {
    await show();
    expect(screen.getByText("unsaved-note")).toBeInTheDocument();
  });

  it("is rendered on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
