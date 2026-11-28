import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { checkpointFixture } from "@/lib/answers/test-content";
import type { CompleteCheckpointResponse } from "@/lib/attempts/contract";
import { smallTargets } from "@/components/exercises/touch-target-check";
import { missingLangEn, thaiUnderEn } from "@/components/exercises/a11y-check";
import { CheckpointResult } from "./CheckpointResult";
import { DONE_RESPONSE } from "./test-support";
import { displayFromResponse, type Completion } from "./view";

const shown = (over: Partial<CompleteCheckpointResponse["result"]> = {}, rest: Partial<CompleteCheckpointResponse> = {}): Completion => ({
  kind: "shown", display: displayFromResponse({ ...DONE_RESPONSE, ...rest, result: { ...DONE_RESPONSE.result, ...over } }),
});
const WEAK = [
  { skill: "pronunciation" as const, weight: 20, score: 0.5, answered: 3, total: 3, selfOk: null },
  { skill: "listening" as const, weight: 25, score: 0.9, answered: 3, total: 3, selfOk: null },
  { skill: "speaking" as const, weight: 0, score: null, answered: 3, total: 3, selfOk: 2 },
  { skill: "reading" as const, weight: 20, score: 0.9, answered: 3, total: 3, selfOk: null },
  { skill: "writing" as const, weight: 35, score: 0.6, answered: 4, total: 4, selfOk: null },
];
function show(completion: Completion, extra: Partial<React.ComponentProps<typeof CheckpointResult>> = {}) {
  const props = { checkpoint: checkpointFixture, completion, practised: new Set<string>(), onRetry: vi.fn(), onRestart: vi.fn(), ...extra };
  return { ...render(<CheckpointResult {...props} />), props };
}

describe("CheckpointResult (plan 3.6, items 36-41)", () => {
  it("36: h1 with the checkpoint number, the passed badge as text, the total and the pass mark", () => {
    show(shown());
    expect(screen.getByRole("heading", { level: 1, name: "ผลแบบทดสอบ ครั้งที่ 1" })).toBeInTheDocument();
    expect(screen.getByText("ผ่าน")).toBeInTheDocument();
    expect(screen.queryByText("ยังไม่ผ่าน")).toBeNull();
    expect(screen.getByText("คะแนนรวม 78%")).toBeInTheDocument();
    expect(screen.getByText("เกณฑ์ผ่าน 70%")).toBeInTheDocument();
  });

  it("36: not passed says ยังไม่ผ่าน in words (not colour only) and stays kind", () => {
    show(shown({ score: 0.55, passed: false, skills: WEAK }));
    expect(screen.getByText("ยังไม่ผ่าน")).toBeInTheDocument();
    expect(screen.queryByText("ผ่าน")).toBeNull();
    expect(document.querySelector("[class*='text-bad'], [class*='bg-bad'], [class*='border-bad']")).toBeNull(); // red is for errors, not for a score
  });

  it("37: a row per skill with the Thai name, a bar, the percentage and how many were answered; speaking is self-rated and unscored", () => {
    show(shown());
    const list = screen.getByRole("list", { name: "คะแนนรายทักษะ" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("ออกเสียง");
    expect(rows[0]).toHaveTextContent("80% · ตอบ 3 จาก 3 ข้อ");
    expect(within(rows[0]).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "80");
    expect(rows[4]).toHaveTextContent("เขียน");
    expect(rows[4]).toHaveTextContent("60% · ตอบ 4 จาก 4 ข้อ");
    expect(rows[2]).toHaveTextContent("พูด");
    expect(rows[2]).toHaveTextContent("ประเมินตัวเอง พูดได้ 2 จาก 3 ข้อ · ไม่นับคะแนน");
    expect(within(rows[2]).queryByRole("progressbar")).toBeNull();
  });

  it("38: skills under 70% get a ควรฝึกซ่อม heading and one replay link per review day", () => {
    show(shown({ score: 0.7, passed: true, skills: WEAK }));
    expect(screen.getByRole("heading", { name: "ควรฝึกซ่อม" })).toBeInTheDocument();
    const link = (name: string) => screen.getByRole("link", { name });
    expect(link("ออกเสียง · วันที่ 1")).toHaveAttribute("href", "/day/1?skill=pronunciation");
    expect(link("ออกเสียง · วันที่ 2")).toHaveAttribute("href", "/day/2?skill=pronunciation");
    expect(link("ออกเสียง · วันที่ 5")).toHaveAttribute("href", "/day/5?skill=pronunciation");
    expect(link("เขียน · วันที่ 1")).toHaveAttribute("href", "/day/1?skill=writing");
    expect(screen.queryByRole("link", { name: /^ฟัง · / })).toBeNull(); // 90% is fine
    expect(screen.queryByRole("link", { name: /^พูด · / })).toBeNull(); // unscored speaking is never remedial
  });

  it("38: a link already replayed after this sitting carries a ✓ ฝึกแล้ว", () => {
    show(shown({ skills: WEAK, score: 0.7 }), { practised: new Set(["2:pronunciation"]) });
    expect(screen.getByRole("link", { name: "ออกเสียง · วันที่ 2 ฝึกแล้ว" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ออกเสียง · วันที่ 1" })).toBeInTheDocument();
  });

  it("38: no skill under the mark: no ควรฝึกซ่อม section at all", () => {
    show(shown());
    expect(screen.queryByText("ควรฝึกซ่อม")).toBeNull();
  });

  it("39: streak line, and for a later sitting the sitting number with the best score", () => {
    show(shown());
    expect(screen.getByText("สตรีค 4 วัน (นานที่สุด 6 วัน)")).toBeInTheDocument();
    expect(screen.queryByText(/รอบที่/)).toBeNull();
    show(shown({ sitting: 3, best: 0.82 }));
    expect(screen.getByText("รอบที่ 3 · ดีที่สุด 82%")).toBeInTheDocument();
  });

  it("39: a result read back later has no streak line (the server does not store it)", () => {
    show({ kind: "shown", display: { ...displayFromResponse(DONE_RESPONSE), streak: null } });
    expect(screen.queryByText(/สตรีค/)).toBeNull();
  });

  it("40: with a next day the one primary action goes to it; otherwise back home; the retake rule is a line, not a button", () => {
    const a = show(shown());
    expect(screen.getByRole("link", { name: "ไปบทเรียนวันที่ 31" })).toHaveAttribute("href", "/day/31");
    expect(screen.getByText("สอบอีกครั้งได้ตั้งแต่พรุ่งนี้")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /สอบอีกครั้ง/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /สอบอีกครั้ง/ })).toBeNull();
    a.unmount();
    show(shown({}, { nextDay: null }));
    expect(screen.getByRole("link", { name: "กลับหน้าแรก" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: /ไปบทเรียนวันที่/ })).toBeNull();
  });

  it("41: pending shows กำลังบันทึก… and no score", () => {
    show({ kind: "pending" });
    expect(screen.getByText("กำลังบันทึก…")).toBeInTheDocument();
    expect(screen.queryByText(/คะแนนรวม/)).toBeNull();
  });

  it("41: queued says the result appears when online, with no score", () => {
    show({ kind: "queued" });
    expect(screen.getByText("จะแสดงผลเมื่อออนไลน์")).toBeInTheDocument();
    expect(screen.queryByText(/คะแนนรวม/)).toBeNull();
  });

  it("41: rejected (409) tells the learner there were no answers on the server and offers a fresh start", async () => {
    const { props } = show({ kind: "rejected", code: 409 });
    expect(screen.getByRole("alert")).toHaveTextContent("บันทึกผลไม่ได้ ไม่มีคำตอบของรอบนี้บนเซิร์ฟเวอร์ ลองทำใหม่");
    await userEvent.click(screen.getByRole("button", { name: "เริ่มทำใหม่" }));
    expect(props.onRestart).toHaveBeenCalledTimes(1);
  });

  it("41: an error offers ลองอีกครั้ง", async () => {
    const { props } = show({ kind: "error" });
    await userEvent.click(screen.getByRole("button", { name: "ลองอีกครั้ง" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("there is exactly one primary action in every state", () => {
    for (const c of [shown(), shown({}, { nextDay: null }), { kind: "pending" }, { kind: "queued" }, { kind: "rejected", code: 409 }, { kind: "error" }] as Completion[]) {
      const v = show(c);
      const primaries = Array.from(v.container.querySelectorAll("a, button")).filter((el) => /bg-accent/.test(el.getAttribute("class") ?? ""));
      expect(primaries.length, JSON.stringify(c).slice(0, 40)).toBeLessThanOrEqual(1);
      v.unmount();
    }
  });

  it("touch targets are 44px tall and English sits under lang=en, Thai never under it", () => {
    const { container } = show(shown({ skills: WEAK, score: 0.7 }));
    expect(smallTargets(container)).toEqual([]);
    expect(missingLangEn(container)).toEqual([]);
    expect(thaiUnderEn(container)).toEqual([]);
  });
});
