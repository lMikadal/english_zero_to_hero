import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerHome } from "@/db/queries/home";
import Home, { dynamic } from "./page";

const lessonFor = vi.hoisted(() => ({ missing: false }));
const query = vi.hoisted(() => ({ result: null as unknown as LearnerHome | Error }));
const getReviewSummary = vi.hoisted(() => vi.fn());
vi.mock("@/lib/srs/cards", () => ({ getReviewSummary }));
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

const fresh: LearnerHome = { currentDay: 1, streak: { current: 0, longest: 0 }, activeToday: false, courseComplete: false, blockingCheckpoint: null, checkpointNote: null };
const show = async () => render(await Home());

describe("Home page", () => {
  beforeEach(() => {
    query.result = fresh;
    lessonFor.missing = false;
    getReviewSummary.mockReset();
    getReviewSummary.mockResolvedValue({ due: 0, withCard: 0 });
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
    expect(bar).toHaveAttribute("aria-valuetext", "3 จาก 365 วัน");
    expect(bar).toHaveAttribute("aria-valuemax", "365");
  });

  it("shows no data the app does not have (last score, weak spots, level, words known for real)", async () => {
    getReviewSummary.mockResolvedValue({ due: 4, withCard: 5 });
    await show();
    for (const t of [/คะแนน/, /ควรฝึก/, /ระดับโดยประมาณ/, /รู้จริง/]) expect(screen.queryByText(t)).not.toBeInTheDocument();
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
    query.result = { currentDay: 365, streak: { current: 40, longest: 90 }, activeToday: true, courseComplete: true, blockingCheckpoint: null, checkpointNote: null };
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

describe("Home page: vocabulary review entry points (plan 2.6 rule 27, item 7.6)", () => {
  beforeEach(() => {
    query.result = { ...fresh, currentDay: 2 };
    lessonFor.missing = false;
    getReviewSummary.mockReset();
  });

  it("shows the words-learned tile next to the streak tiles, counting words (not cards)", async () => {
    getReviewSummary.mockResolvedValue({ due: 0, withCard: 5 });
    await show();
    const tile = screen.getByText("คำที่เรียนแล้ว").closest("div")!;
    expect(tile).toHaveTextContent("5");
    expect(tile.parentElement).toBe(screen.getByText("สตรีคต่อเนื่อง").closest("div")!.parentElement);
    expect(tile).not.toHaveTextContent("5 วัน");
  });

  it("with no finished lesson the tile says 0, not a made-up number", async () => {
    getReviewSummary.mockResolvedValue({ due: 0, withCard: 0 });
    await show();
    expect(screen.getByText("คำที่เรียนแล้ว").closest("div")).toHaveTextContent("0");
  });

  it("due cards: a link 'ทวนคำศัพท์ · ถึงกำหนด N ใบ' to /review, secondary to the lesson button", async () => {
    getReviewSummary.mockResolvedValue({ due: 10, withCard: 5 });
    await show();
    const link = screen.getByRole("link", { name: "ทวนคำศัพท์ · ถึงกำหนด 10 ใบ" });
    expect(link).toHaveAttribute("href", "/review");
    expect(link.className).not.toMatch(/\bbg-accent\b/);
    expect(link.className).toMatch(/\bmin-h-1[1-9]\b/);
    const start = screen.getByRole("link", { name: "เริ่มบทเรียนวันที่ 2" });
    expect(start.className).toMatch(/\bbg-accent\b/);
    expect(start.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("nothing due: no review link at all", async () => {
    getReviewSummary.mockResolvedValue({ due: 0, withCard: 5 });
    await show();
    expect(screen.queryByRole("link", { name: /ทวนคำศัพท์/ })).toBeNull();
    expect(screen.queryByText(/ถึงกำหนด/)).toBeNull();
  });

  it("also shown after the whole course is done", async () => {
    query.result = { currentDay: 365, streak: { current: 40, longest: 90 }, activeToday: true, courseComplete: true, blockingCheckpoint: null, checkpointNote: null };
    getReviewSummary.mockResolvedValue({ due: 7, withCard: 300 });
    await show();
    expect(screen.getByRole("link", { name: "ทวนคำศัพท์ · ถึงกำหนด 7 ใบ" })).toHaveAttribute("href", "/review");
    expect(screen.getByText("คำที่เรียนแล้ว").closest("div")).toHaveTextContent("300");
  });

  it("asks the summary with the learner and the server's clock", async () => {
    getReviewSummary.mockResolvedValue({ due: 0, withCard: 0 });
    await show();
    expect(getReviewSummary).toHaveBeenCalledWith(expect.anything(), "local", expect.any(Date));
  });

  it("if the review numbers cannot be read the page still works and shows no invented tile or link", async () => {
    getReviewSummary.mockRejectedValue(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await show();
    expect(screen.getByRole("link", { name: "เริ่มบทเรียนวันที่ 2" })).toBeInTheDocument();
    expect(screen.queryByText("คำที่เรียนแล้ว")).toBeNull();
    expect(screen.queryByRole("link", { name: /ทวนคำศัพท์/ })).toBeNull();
    expect(screen.getByText("สตรีคต่อเนื่อง")).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("Home page: monthly checkpoint (plan PR 6, D10, D15)", () => {
  beforeEach(() => {
    lessonFor.missing = false;
    getReviewSummary.mockReset();
    getReviewSummary.mockResolvedValue({ due: 0, withCard: 0 });
  });

  it("while a checkpoint blocks day A+1 the main card is the checkpoint: ONE primary link, เริ่มแบบทดสอบ, to /checkpoint/A, and no lesson start", async () => {
    query.result = { ...fresh, currentDay: 31, blockingCheckpoint: 30, checkpointNote: { afterDay: 30, status: "not_taken" } };
    await show();
    expect(screen.getByRole("heading", { level: 2, name: "แบบทดสอบประจำเดือน ครั้งที่ 1" })).toBeInTheDocument();
    expect(screen.getByText(/วันที่ 1–30/)).toBeInTheDocument();
    const start = screen.getByRole("link", { name: "เริ่มแบบทดสอบ" });
    expect(start).toHaveAttribute("href", "/checkpoint/30");
    expect(start.className).toMatch(/bg-accent/);
    expect(screen.queryByRole("link", { name: /เริ่มบทเรียนวันที่/ })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: /วันที่ 31/ })).toBeNull();
    expect(screen.getAllByRole("link")).toEqual([start]); // not also the quiet row: the blocking one is not repeated
  });

  it("the vocabulary review row still shows while blocked, as a secondary link", async () => {
    query.result = { ...fresh, currentDay: 31, blockingCheckpoint: 30, checkpointNote: { afterDay: 30, status: "not_taken" } };
    getReviewSummary.mockResolvedValue({ due: 3, withCard: 9 });
    await show();
    expect(screen.getByRole("link", { name: /ทวนคำศัพท์/ })).toHaveAttribute("href", "/review");
    expect(screen.getAllByRole("link").filter((a) => /bg-accent/.test(a.className))).toHaveLength(1);
  });

  it("D15: a learner already past day A+1 is never blocked: the lesson card stays and a quiet row offers the checkpoint", async () => {
    query.result = { ...fresh, currentDay: 35, blockingCheckpoint: null, checkpointNote: { afterDay: 30, status: "not_taken" } };
    await show();
    expect(screen.getByRole("link", { name: "เริ่มบทเรียนวันที่ 35" })).toHaveAttribute("href", "/day/35");
    const row = screen.getByRole("link", { name: "แบบทดสอบครั้งที่ 1 · ยังไม่ได้สอบ" });
    expect(row).toHaveAttribute("href", "/checkpoint/30");
    expect(row.className).not.toMatch(/bg-accent/);
    expect(screen.queryByRole("link", { name: "เริ่มแบบทดสอบ" })).toBeNull();
  });

  it("a checkpoint that was sat but not passed: the quiet row says so, the lesson card stays", async () => {
    query.result = { ...fresh, currentDay: 31, blockingCheckpoint: null, checkpointNote: { afterDay: 30, status: "not_passed" } };
    await show();
    expect(screen.getByRole("link", { name: "แบบทดสอบครั้งที่ 1 · ยังไม่ผ่าน ดูผลและฝึกซ่อม" })).toHaveAttribute("href", "/checkpoint/30");
    expect(screen.getByRole("link", { name: "เริ่มบทเรียนวันที่ 31" })).toBeInTheDocument();
  });

  it("no checkpoint (no file, a broken file, or passed): the page is exactly the old one, with no checkpoint text or link at all", async () => {
    query.result = { ...fresh, currentDay: 31, blockingCheckpoint: null, checkpointNote: null };
    const { container } = await show();
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/day/31"]);
    expect(container).not.toHaveTextContent("แบบทดสอบ");
  });

  it("when the course is complete there is no checkpoint card even if the data says blocking (nothing to unlock)", async () => {
    query.result = { currentDay: 365, streak: { current: 1, longest: 1 }, activeToday: true, courseComplete: true, blockingCheckpoint: null, checkpointNote: null };
    const { container } = await show();
    expect(container).not.toHaveTextContent("แบบทดสอบ");
  });
});
