import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { smallTargets } from "@/components/exercises/touch-target-check";
import { missingLangEn, thaiUnderEn } from "@/components/exercises/a11y-check";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { checkpointFixture } from "@/lib/answers/test-content";
import { exerciseIds } from "./view";
import { CheckpointIntro } from "./CheckpointIntro";

function show(extra: Partial<React.ComponentProps<typeof CheckpointIntro>> = {}, audio = true) {
  const onStart = vi.fn();
  const view = renderWithAudio(<CheckpointIntro checkpoint={checkpointFixture} resume={null} last={null} onStart={onStart} {...extra} />, fakeAudio(audio));
  return { onStart, ...view };
}

describe("CheckpointIntro (plan 3.3 item 18)", () => {
  it("names the test, the days it covers, the number of questions and the time", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "แบบทดสอบประจำเดือน ครั้งที่ 1" })).toBeInTheDocument();
    expect(screen.getByText("บทเรียนวันที่ 1–30 · 16 ข้อ · ประมาณ 30 นาที")).toBeInTheDocument();
  });
  it("with the real file's title (which already holds the day range) the heading is built from the number and the range appears once", () => {
    const real = { ...checkpointFixture, title: { en: "Checkpoint 1", th: "แบบทดสอบประจำเดือน ครั้งที่ 1: วันที่ 1–30" } };
    const { container } = render(<CheckpointIntro checkpoint={real} resume={null} last={null} onStart={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^แบบทดสอบประจำเดือน ครั้งที่ 1$/);
    expect((container.textContent ?? "").match(/วันที่ 1–30/g)).toHaveLength(1);
    expect(within(screen.getByRole("heading", { level: 1 })).getByText("ครั้งที่ 1").className).toMatch(/whitespace-nowrap/);
  });
  it("states the four rules in plain Thai", () => {
    show();
    const rules = screen.getByRole("list", { name: "กติกา" });
    expect(rules.querySelectorAll("li")).toHaveLength(4);
    for (const t of ["ไม่บอกว่าถูกหรือผิด", "ย้อนกลับไม่ได้", "ไม่นับคะแนน", "24 ชั่วโมง"]) expect(rules).toHaveTextContent(t);
  });
  it("lists the sections with their question counts; speaking says it is not scored", () => {
    show();
    const list = screen.getByRole("list", { name: "ส่วนของแบบทดสอบ" });
    expect(list).toHaveTextContent("ออกเสียง");
    expect(list).toHaveTextContent("พูด");
    expect(list).toHaveTextContent("ไม่นับคะแนน");
    expect(list.querySelectorAll("li")).toHaveLength(5);
  });
  it("first time: one primary button เริ่มแบบทดสอบ that starts, and a way back home that is not primary", async () => {
    const { onStart } = show();
    await userEvent.click(screen.getByRole("button", { name: "เริ่มแบบทดสอบ" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "กลับหน้าแรก" })).toHaveAttribute("href", "/");
  });
  it("a sitting left open: ทำต่อ (ข้อ 6 / 16) from the first unanswered exercise", () => {
    show({ resume: { answered: exerciseIds(checkpointFixture).slice(0, 5) } });
    expect(screen.getByRole("button", { name: "ทำต่อ (ข้อ 6 / 16)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "เริ่มแบบทดสอบ" })).toBeNull();
  });
  it("an earlier sitting on another day: the last score and สอบอีกครั้ง", () => {
    show({ last: { score: 0.62, passed: false } });
    expect(screen.getByText("ครั้งล่าสุด 62% · ยังไม่ผ่าน")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "สอบอีกครั้ง" })).toBeInTheDocument();
  });
  it("the last score is floored: 0.699 reads 69% next to ยังไม่ผ่าน", () => {
    show({ last: { score: 0.699, passed: false } });
    expect(screen.getByText("ครั้งล่าสุด 69% · ยังไม่ผ่าน")).toBeInTheDocument();
  });
  it("a passed earlier sitting says ผ่าน", () => {
    show({ last: { score: 0.8, passed: true } });
    expect(screen.getByText("ครั้งล่าสุด 80% · ผ่าน")).toBeInTheDocument();
  });
  it("without English sound it warns that listening questions will be skipped and count 0, but still lets the learner start", async () => {
    show({}, false);
    await screen.findByText(/เล่นเสียงภาษาอังกฤษไม่ได้/);
    expect(screen.getByRole("button", { name: "เริ่มแบบทดสอบ" })).toBeEnabled();
  });
  it("with sound there is no warning", async () => {
    show();
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText(/เล่นเสียงภาษาอังกฤษไม่ได้/)).toBeNull();
  });
  it("touch targets, language marks", () => {
    const { container } = show({ last: { score: 0.5, passed: false } });
    expect(smallTargets(container)).toEqual([]);
    expect(missingLangEn(container)).toEqual([]);
    expect(thaiUnderEn(container)).toEqual([]);
    void render;
  });
});
