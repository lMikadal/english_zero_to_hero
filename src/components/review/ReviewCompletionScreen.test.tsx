import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SinkState } from "@/lib/offline/http-sink";
import { ReviewCompletionScreen } from "./ReviewCompletionScreen";

// The unsaved note on this screen reads the real sink; stand in for it with a state we choose.
const sinkState = vi.hoisted(() => ({ current: null as unknown as SinkState }));
vi.mock("@/lib/offline/http-sink", () => ({
  getSyncSink: () => ({ getState: () => sinkState.current, subscribe: () => () => {} }),
}));

const COUNTS = { 1: 0, 2: 0, 3: 0, 4: 1 } as const;
const base: SinkState = { pending: 0, pendingAttempts: 0, pendingReviews: 0, pendingReviewCompletions: 0, status: "idle" };
const show = (state: Partial<SinkState>) => {
  sinkState.current = { ...base, ...state };
  render(<ReviewCompletionScreen total={1} counts={COUNTS} result={{ status: "queued" }} onRetry={() => {}} onContinue={() => {}} />);
};

describe("the unsaved note on the review completion screen is worded from what the sink holds", () => {
  it("a waiting LESSON completion (no review completion) is named as the lesson, even here", () => {
    show({ pending: 1 });
    const note = screen.getByText(/ยังไม่ได้บันทึก อย่าปิดหน้านี้/);
    expect(note).toHaveTextContent("มีผลบทเรียนที่ยังไม่ได้บันทึก");
    expect(note).not.toHaveTextContent("ทวนคำศัพท์");
  });

  it("a waiting review completion is named as the review", () => {
    show({ pending: 1, pendingReviewCompletions: 1 });
    expect(screen.getByText(/ยังไม่ได้บันทึก อย่าปิดหน้านี้/)).toHaveTextContent("มีผลการทวนคำศัพท์ที่ยังไม่ได้บันทึก");
  });
});
