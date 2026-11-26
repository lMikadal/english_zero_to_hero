import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLesson } from "@/lib/answers/test-content";
import Page from "./page";

const listDoneDays = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/server/current-user", () => ({ getCurrentUserId: async () => "local" }));
vi.mock("@/db/queries/practice", () => ({ listDoneDays }));
const lessons = vi.hoisted(() => ({ throwFor: new Set<number>(), override: null as null | ((l: import("@/lib/content/schema").Lesson) => import("@/lib/content/schema").Lesson) }));
vi.mock("@/lib/content/repo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/content/repo")>();
  return { ...real, getLesson: (day: number) => { if (lessons.throwFor.has(day)) throw new Error("bad file"); const l = real.getLesson(day); return l && lessons.override ? lessons.override(l) : l; } };
});

const done = (day: number, score: number | null) => ({ day, score, completedAt: new Date("2026-11-25T10:00:00Z") });
const show = async () => render(await Page());
const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("practice page", () => {
  beforeEach(() => {
    lessons.throwFor.clear();
    lessons.override = null;
    listDoneDays.mockResolvedValue([done(2, 0.8), done(1, 0.94)]);
  });

  it("has the h1, a short true rule line and the h2", async () => {
    await show();
    expect(screen.getByRole("heading", { level: 1, name: "ฝึกเพิ่ม" })).toBeInTheDocument();
    const rule = screen.getByText(/เล่นทั้งบทจนจบและตอบอย่างน้อยหนึ่งข้อ นับสตรีค/);
    expect(rule).toHaveTextContent("เล่นทีละทักษะไม่นับ");
    expect(rule).toHaveTextContent("คะแนนเดิมของบทไม่เปลี่ยน");
    expect(screen.getByRole("heading", { level: 2, name: "เล่นบทที่เรียนแล้วซ้ำ" })).toBeInTheDocument();
  });

  it("lists finished days in the order the query gives (newest first) with day, titles and original score", async () => {
    await show();
    const [first, second] = rows();
    expect(first).toHaveTextContent("วันที่ 2");
    expect(first).toHaveTextContent("คะแนน 80%");
    expect(second).toHaveTextContent("วันที่ 1");
    expect(second).toHaveTextContent("คะแนน 94%");
    const lesson = readLesson(1);
    expect(within(second).getByText(lesson.title.en)).toHaveAttribute("lang", "en");
    expect(within(second).getByText(lesson.title.th)).not.toHaveAttribute("lang", "en");
  });

  it("each row is a details with a summary; expanded it links the whole lesson and each skill of the lesson", async () => {
    await show();
    const row = rows()[1]; // day 1
    expect(row.querySelector("details > summary")).not.toBeNull();
    expect(within(row).getByRole("link", { name: "เล่นทั้งบท วันที่ 1" })).toHaveAttribute("href", "/day/1");
    const skills = [["ออกเสียง", "pronunciation"], ["ฟัง", "listening"], ["พูด", "speaking"], ["อ่าน", "reading"], ["เขียน", "writing"]];
    for (const [label, skill] of skills) {
      expect(within(row).getByRole("link", { name: new RegExp(`^${label}`) })).toHaveAttribute("href", `/day/1?skill=${skill}`);
    }
    expect(within(row).getAllByRole("link")).toHaveLength(6);
    expect(within(row).getByRole("link", { name: /^ฟัง/ })).toHaveTextContent("2 ข้อ");
  });

  it("gives every link sr-only day context in its accessible name while the visible text stays the same", async () => {
    await show();
    const row = rows()[1]; // day 1
    const whole = within(row).getByRole("link", { name: "เล่นทั้งบท วันที่ 1" });
    expect(whole.querySelector(".sr-only")).toHaveTextContent("วันที่ 1");
    expect(within(row).getByRole("link", { name: "ฟัง · 2 ข้อ วันที่ 1" })).toHaveAttribute("href", "/day/1?skill=listening");
    // every link of every row names its day
    for (const [i, day] of [2, 1].entries()) {
      for (const a of within(rows()[i]).getAllByRole("link")) expect(a).toHaveAccessibleName(new RegExp(`วันที่ ${day}$`));
    }
  });

  it("shows a decorative chevron on each expandable row that turns when open", async () => {
    await show();
    for (const row of rows()) {
      const chevron = row.querySelector("summary [data-chevron]");
      expect(chevron).not.toBeNull();
      expect(chevron).toHaveAttribute("aria-hidden", "true");
      expect(chevron!.getAttribute("class")).toMatch(/group-open:rotate-/);
    }
  });

  // jsdom has no layout, so this only checks the wrapping classes are on the title containers; it cannot prove the
  // text really wraps at 360px (that needs a real browser, see docs/PLAN.md).
  it("lets a long unbroken English title and a long Thai title wrap instead of overflowing", async () => {
    const long = "Supercalifragilistic".repeat(3).slice(0, 60); // one 60-character word
    expect(long).toHaveLength(60);
    lessons.override = (l) => ({ ...l, title: { en: long, th: "บทเรียนที่มีชื่อภาษาไทยยาวมากๆ ".repeat(4).trim() } });
    listDoneDays.mockResolvedValue([done(1, 0.5)]);
    await show();
    const en = screen.getByText(long);
    const th = screen.getByText(/บทเรียนที่มีชื่อภาษาไทยยาวมาก/);
    for (const el of [en, th]) expect(el.className).toMatch(/\bbreak-words\b/);
    const summary = rows()[0].querySelector("summary")!;
    expect(en.parentElement!.className).toMatch(/\bmin-w-0\b/); // the flex child holding the titles may shrink
    expect(summary.className).toMatch(/\bitems-center\b/);
  });

  it("shows no score text when the score is null", async () => {
    listDoneDays.mockResolvedValue([done(1, null)]);
    await show();
    expect(rows()[0]).not.toHaveTextContent("คะแนน");
    expect(within(rows()[0]).getByRole("link", { name: /^เล่นทั้งบท/ })).toBeInTheDocument();
  });

  it.each([["no lesson file", 200], ["an invalid lesson file", 1]])("keeps the page alive for %s: row without title or links", async (_n, day) => {
    if (day === 1) lessons.throwFor.add(1);
    listDoneDays.mockResolvedValue([done(day, 0.5), done(2, 0.9)]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await show();
    const [broken, ok] = rows();
    expect(broken).toHaveTextContent(`วันที่ ${day} · ไม่มีเนื้อหา`);
    expect(within(broken).queryAllByRole("link")).toEqual([]);
    expect(within(ok).getAllByRole("link").length).toBeGreaterThan(1);
    error.mockRestore();
  });

  it("explains an empty list honestly and links to today's lesson", async () => {
    listDoneDays.mockResolvedValue([]);
    await show();
    expect(screen.getByText("ยังไม่มีบทที่เรียนจบ เรียนบทแรกให้จบก่อน")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ไปบทเรียนวันนี้" })).toHaveAttribute("href", "/today");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows the database-error screen, not a crash", async () => {
    listDoneDays.mockRejectedValue(new Error("down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await show();
    expect(screen.getByText("เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ลองใหม่" })).toHaveAttribute("href", "/practice");
    error.mockRestore();
  });

  it("has no controls for features that do not exist yet", async () => {
    await show();
    expect(document.body.textContent).not.toMatch(/ทวนคำศัพท์|จุดอ่อน|10 ข้อ|เร็วๆ นี้/);
  });

  it("every link and summary is at least 44px tall (min-h-11 or taller)", async () => {
    await show();
    const targets = [...document.querySelectorAll("a, summary")];
    expect(targets.length).toBeGreaterThan(5);
    for (const el of targets) expect(el.className, el.textContent ?? "").toMatch(/\bmin-h-(1[1-9]|[2-9]\d)\b/);
  });

  it("is always rendered dynamically", async () => {
    expect((await import("./page")).dynamic).toBe("force-dynamic");
  });
});
