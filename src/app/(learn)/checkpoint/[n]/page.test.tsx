import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkpointFixture } from "@/lib/answers/test-content";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import type { StoredCheckpointResult } from "@/db/queries/checkpoints";
import CheckpointPage from "./page";

vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: () => {} }) }));
const dayStatus = vi.hoisted(() => vi.fn<(day: number) => Promise<string>>());
vi.mock("../../access", () => ({
  getDayStatus: dayStatus,
  getLearnerProfile: async () => ({ currentDay: 31, timezone: "Asia/Bangkok", accent: "us" }),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/server/current-user", () => ({ getCurrentUserId: async () => "u1" }));
const q = vi.hoisted(() => ({
  results: [] as unknown[],
  open: null as null | { sessionId: string; answered: string[] },
  practised: new Set<string>(),
  streak: { current: 4, longest: 6 },
  fail: false,
  asked: [] as unknown[][],
}));
vi.mock("@/db/queries/checkpoints", () => ({
  listCheckpointResults: async () => { if (q.fail) throw new Error("db down"); return q.results; },
  findOpenSitting: async () => q.open,
  practisedSince: async (...args: unknown[]) => { q.asked.push(args); return q.practised; },
}));
vi.mock("@/db/queries/progress", () => ({ getStreak: async () => q.streak }));
const file = vi.hoisted(() => ({ value: null as Checkpoint | null | "throw" }));
vi.mock("@/lib/content/repo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/content/repo")>();
  return { ...real, getCheckpoint: () => { if (file.value === "throw") throw new Error("bad file"); return file.value; } };
});

const params = (n: string) => Promise.resolve({ n });
const show = async (n = "30") => render(await CheckpointPage({ params: params(n) }));
const stored = (over: Partial<StoredCheckpointResult> = {}): StoredCheckpointResult => ({
  id: "5e2a6c1e-0b53-4a0e-9c43-7d6f1b8e0011", afterDay: 30, score: 0.62, startedAt: new Date(Date.now() - 3_600_000), completedAt: new Date(Date.now() - 86_400_000 * 3),
  skills: [
    { skill: "pronunciation", weight: 20, score: 0.5, answered: 3, total: 3, selfOk: null },
    { skill: "listening", weight: 25, score: 0.9, answered: 3, total: 3, selfOk: null },
    { skill: "speaking", weight: 0, score: null, answered: 3, total: 3, selfOk: 1 },
    { skill: "reading", weight: 20, score: 0.9, answered: 3, total: 3, selfOk: null },
    { skill: "writing", weight: 35, score: 0.6, answered: 4, total: 4, selfOk: null },
  ],
  ...over,
});

describe("checkpoint page (plan 3.2 item 17, in this order)", () => {
  beforeEach(() => {
    file.value = checkpointFixture;
    dayStatus.mockResolvedValue("done");
    q.results = []; q.open = null; q.practised = new Set(); q.fail = false; q.asked = [];
  });

  it.each(["45", "030", "0", "abc", "1.5", "30.0", "-30", "390", "3000", "", " 30", "+30", "00030", "300x"])("calls notFound for /checkpoint/%j", async (n) => {
    await expect(CheckpointPage({ params: params(n) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it.each(["30", "60", "300", "360"])("accepts the canonical day %s (the 404 test is about the form, not the file)", async (n) => {
    await expect(CheckpointPage({ params: params(n) })).resolves.toBeTruthy();
  });

  it("a database error shows the retry screen, even before it knows whether there is a file", async () => {
    dayStatus.mockRejectedValue(new Error("db down"));
    file.value = null;
    await show();
    expect(screen.getByText("เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ลองใหม่" })).toHaveAttribute("href", "/checkpoint/30");
  });

  it("a failing results query is a database error as well", async () => {
    q.fail = true;
    await show();
    expect(screen.getByText("เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง")).toBeInTheDocument();
  });

  it.each([null, "throw"] as const)("no usable file (%s): ยังไม่มีแบบทดสอบนี้, with a way home", async (v) => {
    file.value = v;
    await show();
    expect(screen.getByText("ยังไม่มีแบบทดสอบนี้")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "กลับหน้าแรก" })).toHaveAttribute("href", "/");
  });

  it.each(["not_started", "in_progress"])("day 30 %s: ยังไม่ปลดล็อก with the day to finish and a link to /today", async (status) => {
    dayStatus.mockResolvedValue(status);
    await show();
    expect(screen.getByText("ยังไม่ปลดล็อก")).toBeInTheDocument();
    expect(screen.getByText(/เรียนถึงวันที่ 30 ให้จบก่อน/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ไปเรียนต่อ/ })).toHaveAttribute("href", "/today");
    expect(screen.queryByRole("button", { name: "เริ่มแบบทดสอบ" })).toBeNull();
  });

  it("first time: the intro with the start button", async () => {
    await show();
    expect(screen.getByRole("heading", { level: 1, name: "แบบทดสอบประจำเดือน ครั้งที่ 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เริ่มแบบทดสอบ" })).toBeInTheDocument();
  });

  it("a sitting left open: ทำต่อ with the number of the first unanswered exercise", async () => {
    q.open = { sessionId: "5e2a6c1e-0b53-4a0e-9c43-7d6f1b8e0012", answered: ["c030-pron-01", "c030-pron-02", "c030-pron-03", "c030-listen-01", "c030-listen-02"] };
    await show();
    expect(screen.getByRole("button", { name: "ทำต่อ (ข้อ 6 / 16)" })).toBeInTheDocument();
  });

  it("taken on an earlier day: the intro says the last score and offers สอบอีกครั้ง", async () => {
    q.results = [stored()];
    await show();
    expect(screen.getByText("ครั้งล่าสุด 62% · ยังไม่ผ่าน")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "สอบอีกครั้ง" })).toBeInTheDocument();
  });

  it("taken today: the result and สอบอีกครั้งได้ตั้งแต่พรุ่งนี้, no start button, the live streak, a link to the next day", async () => {
    q.results = [stored({ completedAt: new Date() })];
    await show();
    expect(screen.getByRole("heading", { level: 1, name: "ผลแบบทดสอบ ครั้งที่ 1" })).toBeInTheDocument();
    expect(screen.getByText("คะแนนรวม 62%")).toBeInTheDocument();
    expect(screen.getByText("ยังไม่ผ่าน")).toBeInTheDocument();
    expect(screen.getByText("สอบอีกครั้งได้ตั้งแต่พรุ่งนี้")).toBeInTheDocument();
    expect(screen.getByText("สตรีค 4 วัน (นานที่สุด 6 วัน)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /เริ่มแบบทดสอบ|สอบอีกครั้ง|ทำต่อ/ })).toBeNull();
    expect(screen.getByRole("link", { name: "ไปบทเรียนวันที่ 31" })).toHaveAttribute("href", "/day/31");
  });

  it("taken today twice: the second sitting's number and the best of both", async () => {
    q.results = [stored({ id: "5e2a6c1e-0b53-4a0e-9c43-7d6f1b8e0013", score: 0.8, completedAt: new Date(Date.now() - 86_400_000 * 2) }), stored({ completedAt: new Date() })];
    await show();
    expect(screen.getByText("รอบที่ 2 · ดีที่สุด 80%")).toBeInTheDocument();
  });

  it("replay ticks: asks for practice after the sitting finished and shows ✓ for the link that was replayed", async () => {
    const done = new Date();
    q.results = [stored({ completedAt: done })];
    q.practised = new Set(["d001-pron-02"]); // an exercise of day 1's pronunciation section
    await show();
    expect(q.asked.length).toBeGreaterThan(0);
    expect(q.asked[0][3]).toEqual(done);
    expect(screen.getByRole("link", { name: "ออกเสียง · วันที่ 1 ฝึกแล้ว" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ออกเสียง · วันที่ 2" })).toBeInTheDocument();
  });
});
