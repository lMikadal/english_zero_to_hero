import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HttpSink, SinkState } from "@/lib/offline/http-sink";
import { UnsavedGuard, UnsavedNote } from "./UnsavedNote";

function fakeSink(initial: Partial<SinkState> = {}) {
  let state: SinkState = { pending: 0, pendingAttempts: 0, pendingReviews: 0, pendingReviewCompletions: 0, status: "idle", ...initial };
  const listeners = new Set<() => void>();
  const sink = {
    getState: () => state,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  } as Pick<HttpSink, "getState" | "subscribe">;
  return { sink, set(next: Partial<SinkState>) { state = { ...state, ...next }; listeners.forEach((cb) => cb()); }, listeners };
}

const fire = () => {
  const e = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  window.dispatchEvent(e);
  return e;
};

describe("UnsavedNote", () => {
  it("shows nothing when everything is saved", () => {
    const { sink } = fakeSink();
    const { container } = render(<UnsavedNote sink={sink} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows how many answers are not saved yet, and follows the sink", () => {
    const f = fakeSink({ pending: 3, pendingAttempts: 3 });
    render(<UnsavedNote sink={f.sink} />);
    expect(screen.getByRole("status")).toHaveTextContent("มีคำตอบ 3 ข้อที่ยังไม่ได้บันทึก อย่าปิดหน้านี้");
    act(() => f.set({ pending: 0, pendingAttempts: 0 }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says so when only the lesson result is waiting", () => {
    render(<UnsavedNote sink={fakeSink({ pending: 1, pendingAttempts: 0 }).sink} />);
    expect(screen.getByRole("status")).toHaveTextContent("ยังไม่ได้บันทึก อย่าปิดหน้านี้");
  });

  it("says it is the vocabulary reviews, not the lesson result, when only reviews are waiting", () => {
    const f = fakeSink({ pending: 3, pendingAttempts: 0, pendingReviews: 3 });
    render(<UnsavedNote sink={f.sink} />);
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("มีผลการทวนคำศัพท์ 3 ใบที่ยังไม่ได้บันทึก อย่าปิดหน้านี้");
    expect(note).not.toHaveTextContent("บทเรียน");
  });

  it("on the review page, a waiting completion (no answers pending) is about the review, never the lesson", () => {
    render(<UnsavedNote kind="review" sink={fakeSink({ pending: 1, pendingAttempts: 0, pendingReviews: 0 }).sink} />);
    expect(screen.getByRole("status")).toHaveTextContent("ผลการทวนคำศัพท์ที่ยังไม่ได้บันทึก อย่าปิดหน้านี้");
    expect(screen.getByRole("status")).not.toHaveTextContent("บทเรียน");
  });

  it("on any page (no kind given), a lone waiting review completion uses the review wording, taken from the sink state", () => {
    render(<UnsavedNote sink={fakeSink({ pending: 1, pendingAttempts: 0, pendingReviews: 0, pendingReviewCompletions: 1 }).sink} />);
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("มีผลการทวนคำศัพท์ที่ยังไม่ได้บันทึก อย่าปิดหน้านี้");
    expect(note).not.toHaveTextContent("บทเรียน");
  });

  it("a lesson completion waiting next to a review completion keeps the generic wording only for the lesson", () => {
    render(<UnsavedNote sink={fakeSink({ pending: 2, pendingAttempts: 0, pendingReviews: 0, pendingReviewCompletions: 1 }).sink} />);
    expect(screen.getByRole("status")).toHaveTextContent("มีผลบทเรียนที่ยังไม่ได้บันทึก");
  });

  it("the lesson wording is unchanged when no kind is given", () => {
    render(<UnsavedNote sink={fakeSink({ pending: 1, pendingAttempts: 0, pendingReviews: 0 }).sink} />);
    expect(screen.getByRole("status")).toHaveTextContent("มีผลบทเรียนที่ยังไม่ได้บันทึก");
  });

  it("asks the browser to confirm leaving only while something is pending (no alert/confirm)", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const confirm = vi.spyOn(window, "confirm").mockImplementation(() => true);
    const f = fakeSink({ pending: 2, pendingAttempts: 2 });
    render(<UnsavedNote sink={f.sink} />);
    const e = fire();
    expect(e.defaultPrevented).toBe(true);
    act(() => f.set({ pending: 0, pendingAttempts: 0 }));
    expect(fire().defaultPrevented).toBe(false);
    expect(alert).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    alert.mockRestore();
    confirm.mockRestore();
  });

  it("removes the handler and the subscription on unmount", () => {
    const f = fakeSink({ pending: 1, pendingAttempts: 1 });
    const view = render(<UnsavedNote sink={f.sink} />);
    view.unmount();
    expect(f.listeners.size).toBe(0);
    expect(fire().defaultPrevented).toBe(false);
  });
});

describe("UnsavedGuard", () => {
  it("only guards: renders nothing but still warns before unload", () => {
    const { container } = render(<UnsavedGuard sink={fakeSink({ pending: 1, pendingAttempts: 1 }).sink} />);
    expect(container).toBeEmptyDOMElement();
    expect(fire().defaultPrevented).toBe(true);
  });
});
