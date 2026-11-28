import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { smallTargets } from "@/components/exercises/touch-target-check";
import { HomeCheckpointCard, HomeCheckpointLink, PracticeCheckpointSection, type PracticeEntry } from "./CheckpointEntry";

const entry = (over: Partial<PracticeEntry> = {}): PracticeEntry => ({ afterDay: 30, status: "not_taken", latest: null, best: null, ...over });

describe("HomeCheckpointCard (D10: the home card while a checkpoint blocks the next day)", () => {
  it("names the checkpoint and the days it covers and has ONE primary link, เริ่มแบบทดสอบ, to it (never a lesson start)", () => {
    const { container } = render(<HomeCheckpointCard afterDay={30} />);
    expect(screen.getByRole("region", { name: "แบบทดสอบประจำเดือน" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "แบบทดสอบประจำเดือน ครั้งที่ 1" })).toBeInTheDocument();
    expect(container).toHaveTextContent("วันที่ 1–30");
    const link = screen.getByRole("link", { name: "เริ่มแบบทดสอบ" });
    expect(link).toHaveAttribute("href", "/checkpoint/30");
    expect(link.className).toMatch(/bg-accent/);
    expect(screen.getAllByRole("link")).toEqual([link]);
    expect(container).not.toHaveTextContent("เริ่มบทเรียนวันที่");
  });
  it("says why: the next day opens once it is sat, whatever the score", () => {
    render(<HomeCheckpointCard afterDay={60} />);
    expect(screen.getByText(/บทเรียนวันที่ 61 จะเปิด/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "แบบทดสอบประจำเดือน ครั้งที่ 2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "เริ่มแบบทดสอบ" })).toHaveAttribute("href", "/checkpoint/60");
  });
  it("touch targets are at least 44px", () => {
    const { container } = render(<HomeCheckpointCard afterDay={30} />);
    expect(smallTargets(container)).toEqual([]);
  });
});

describe("HomeCheckpointLink (the quiet row under the lesson card)", () => {
  it("not taken yet: แบบทดสอบครั้งที่ k · ยังไม่ได้สอบ", () => {
    render(<HomeCheckpointLink note={{ afterDay: 30, status: "not_taken" }} />);
    const link = screen.getByRole("link", { name: "แบบทดสอบครั้งที่ 1 · ยังไม่ได้สอบ" });
    expect(link).toHaveAttribute("href", "/checkpoint/30");
    expect(link.className).not.toMatch(/bg-accent/); // secondary: the lesson button stays the one primary action
  });
  it("not passed: … · ยังไม่ผ่าน ดูผลและฝึกซ่อม", () => {
    render(<HomeCheckpointLink note={{ afterDay: 90, status: "not_passed" }} />);
    expect(screen.getByRole("link", { name: "แบบทดสอบครั้งที่ 3 · ยังไม่ผ่าน ดูผลและฝึกซ่อม" })).toHaveAttribute("href", "/checkpoint/90");
  });
  it("renders nothing without a note", () => {
    const { container } = render(<HomeCheckpointLink note={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("touch targets are at least 44px", () => {
    const { container } = render(<HomeCheckpointLink note={{ afterDay: 30, status: "not_taken" }} />);
    expect(smallTargets(container)).toEqual([]);
  });
});

describe("PracticeCheckpointSection (/practice)", () => {
  it("renders nothing when no checkpoint is open", () => {
    const { container } = render(<PracticeCheckpointSection entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("one row per open checkpoint with its status, each a link to /checkpoint/A", () => {
    render(
      <PracticeCheckpointSection
        entries={[
          entry({ afterDay: 30, status: "passed", latest: 0.8, best: 0.8 }),
          entry({ afterDay: 60, status: "not_passed", latest: 0.699, best: 0.699 }),
          entry({ afterDay: 90 }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "แบบทดสอบประจำเดือน" })).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "แบบทดสอบประจำเดือน" })).getAllByRole("link");
    expect(rows.map((r) => r.getAttribute("href"))).toEqual(["/checkpoint/30", "/checkpoint/60", "/checkpoint/90"]);
    expect(rows[0]).toHaveTextContent("ครั้งที่ 1 · วันที่ 1–30");
    expect(rows[0]).toHaveTextContent("ผ่าน · ดีที่สุด 80%");
    expect(rows[1]).toHaveTextContent("ครั้งที่ 2 · วันที่ 1–60");
    expect(rows[1]).toHaveTextContent("ยังไม่ผ่าน · ล่าสุด 69%"); // floored: a failing score never reads as 70%
    expect(rows[2]).toHaveTextContent("ยังไม่ได้สอบ");
  });
  it("touch targets are at least 44px", () => {
    const { container } = render(<PracticeCheckpointSection entries={[entry()]} />);
    expect(smallTargets(container)).toEqual([]);
  });
});
