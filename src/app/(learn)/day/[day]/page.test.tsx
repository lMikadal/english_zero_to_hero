import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DayPage from "./page";

// DayPlayer refreshes the router when a day is done; there is no app router in a unit test (notFound stays real)
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: () => {} }) }));
const getCurrentDay = vi.hoisted(() => vi.fn<() => Promise<number>>());
const getDayStatus = vi.hoisted(() => vi.fn<(day: number) => Promise<string>>());
const gate = vi.hoisted(() => ({ blocking: null as number | null }));
vi.mock("../../access", () => ({
  getCurrentDay,
  getDayStatus,
  getGate: async () => {
    const currentDay = await getCurrentDay();
    return { currentDay, blocking: gate.blocking, playableDay: gate.blocking === null ? currentDay : currentDay - 1 };
  },
}));
const getLessonMock = vi.hoisted(() => ({ fail: false, without: null as string | null }));
vi.mock("@/lib/content/repo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/content/repo")>();
  return { ...real, getLesson: (day: number) => { if (getLessonMock.fail) throw new Error("bad lesson file"); const l = real.getLesson(day); return l && getLessonMock.without ? { ...l, sections: l.sections.filter((x) => x.skill !== getLessonMock.without) } : l; } };
});

const params = (day: string) => Promise.resolve({ day });
const show = async (day: string, searchParams?: Record<string, string | string[]>) =>
  render(await DayPage({ params: params(day), searchParams: Promise.resolve(searchParams ?? {}) }));

describe("day page", () => {
  beforeEach(() => {
    getCurrentDay.mockResolvedValue(365);
    getDayStatus.mockResolvedValue("not_started");
    getLessonMock.fail = false;
    gate.blocking = null;
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

describe("day page replay", () => {
  beforeEach(() => {
    getCurrentDay.mockResolvedValue(365);
    getDayStatus.mockResolvedValue("done");
    getLessonMock.fail = false;
    getLessonMock.without = null;
  });

  it("plays a finished day in practice mode (replay marker, whole lesson)", async () => {
    await show("1");
    expect(screen.getByText("เล่นซ้ำ")).toBeInTheDocument();
    expect(screen.getByText("ข้อ 1 / 10")).toBeInTheDocument();
  });

  it.each(["not_started", "in_progress"])("plays a %s day as a normal lesson, without the replay marker", async (status) => {
    getDayStatus.mockResolvedValue(status);
    await show("1");
    expect(screen.queryByText(/เล่นซ้ำ/)).not.toBeInTheDocument();
    expect(screen.getByText("ข้อ 1 / 10")).toBeInTheDocument();
  });

  it("plays only the listening section for ?skill=listening", async () => {
    await show("1", { skill: "listening" });
    expect(screen.getByText("เล่นซ้ำ · ฟัง")).toBeInTheDocument();
    expect(screen.getByText("ข้อ 1 / 2")).toBeInTheDocument();
  });

  it.each([["vocabulary"], ["x"], [""], ["Listening"], [["listening", "reading"]]])("answers 404 for ?skill=%j", async (skill) => {
    await expect(DayPage({ params: params("1"), searchParams: Promise.resolve({ skill }) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("answers 404 for a bad skill before touching the database", async () => {
    getCurrentDay.mockRejectedValue(new Error("down"));
    await expect(DayPage({ params: params("1"), searchParams: Promise.resolve({ skill: "x" }) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("explains a skill replay of an unfinished day, with a way to the lesson", async () => {
    getDayStatus.mockResolvedValue("in_progress");
    await show("1", { skill: "listening" });
    expect(screen.getByText("ฝึกแยกส่วนได้หลังเรียนบทนี้จบ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ไปเรียนบทวันที่ 1/ })).toHaveAttribute("href", "/day/1");
    expect(screen.queryByText(/ข้อ 1 \//)).not.toBeInTheDocument();
  });

  it("explains a skill the lesson does not have, with a way back to /practice", async () => {
    getLessonMock.without = "writing";
    await show("2", { skill: "writing" });
    expect(screen.getByText("บทนี้ไม่มีส่วนเขียน")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "กลับไปหน้าฝึกเพิ่ม" })).toHaveAttribute("href", "/practice");
  });

  it("shows the database-error screen when the day status cannot be read", async () => {
    getDayStatus.mockRejectedValue(new Error("down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await show("1");
    expect(screen.getByText("เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง")).toBeInTheDocument();
    error.mockRestore();
  });

  it("keeps the no-lesson screen for a finished day whose file is missing", async () => {
    await show("200");
    expect(screen.getByText("ยังไม่มีบทเรียนของวันนี้")).toBeInTheDocument();
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

  it("keeps ?skill in the retry link when the current day cannot be read", async () => {
    getCurrentDay.mockRejectedValue(new Error("down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await show("1", { skill: "reading" });
    expect(screen.getByRole("link", { name: "ลองใหม่" })).toHaveAttribute("href", "/day/1?skill=reading");
    error.mockRestore();
  });

  it("keeps ?skill in the retry link when the day status cannot be read", async () => {
    getCurrentDay.mockResolvedValue(365);
    getDayStatus.mockRejectedValue(new Error("down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await show("1", { skill: "reading" });
    expect(screen.getByRole("link", { name: "ลองใหม่" })).toHaveAttribute("href", "/day/1?skill=reading");
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

describe("day page: a monthly checkpoint blocks the next day (plan PR 6, item 15 page side)", () => {
  beforeEach(() => {
    getCurrentDay.mockResolvedValue(31);
    getDayStatus.mockResolvedValue("not_started");
    getLessonMock.fail = false;
    getLessonMock.without = null;
    gate.blocking = 30;
  });

  it("the current day while blocked: ทำแบบทดสอบประจำเดือนก่อน with ONE primary way in, ไปทำแบบทดสอบ -> /checkpoint/A", async () => {
    await show("31");
    expect(screen.getByRole("heading", { level: 1, name: "ทำแบบทดสอบประจำเดือนก่อน" })).toBeInTheDocument();
    const go = screen.getByRole("link", { name: "ไปทำแบบทดสอบ" });
    expect(go).toHaveAttribute("href", "/checkpoint/30");
    expect(go.className).toMatch(/bg-accent/);
    expect(screen.getAllByRole("link")).toEqual([go]);
    expect(screen.queryByText("ฟังและสังเกตรูปปาก")).toBeNull(); // no lesson player
  });

  it("a later locked day keeps its old message and its link goes to the highest playable day", async () => {
    await show("40");
    expect(screen.getByText(/ยังไม่ปลดล็อก/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ไปบทเรียนวันที่ 30/ })).toHaveAttribute("href", "/day/30");
  });

  it("days up to A still open as before (a finished day is a replay)", async () => {
    getDayStatus.mockResolvedValue("done");
    await show("30");
    expect(screen.getByText("เล่นซ้ำ")).toBeInTheDocument();
  });

  it("not blocked (no file, a broken file, D15, or already sat): day A+1 opens exactly as before", async () => {
    gate.blocking = null;
    await show("31");
    expect(screen.queryByText("ทำแบบทดสอบประจำเดือนก่อน")).toBeNull();
    expect(screen.getByText("ฟังและสังเกตรูปปาก")).toBeInTheDocument();
  });

  it("not blocked: a locked day still links to the current day (unchanged)", async () => {
    gate.blocking = null;
    getCurrentDay.mockResolvedValue(2);
    await show("3");
    expect(screen.getByRole("link", { name: /ไปบทเรียนวันที่ 2/ })).toHaveAttribute("href", "/day/2");
  });
});
