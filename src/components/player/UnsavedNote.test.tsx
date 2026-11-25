import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HttpSink, SinkState } from "@/lib/offline/http-sink";
import { UnsavedGuard, UnsavedNote } from "./UnsavedNote";

function fakeSink(initial: Partial<SinkState> = {}) {
  let state: SinkState = { pending: 0, pendingAttempts: 0, status: "idle", ...initial };
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

  it("asks the browser to confirm leaving only while something is pending (no alert/confirm)", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const confirm = vi.spyOn(window, "confirm").mockImplementation(() => true);
    const f = fakeSink({ pending: 2, pendingAttempts: 2 });
    render(<UnsavedNote sink={f.sink} />);
    const e = fire();
    expect(e.defaultPrevented).toBe(true);
    expect(e.returnValue).toBe("");
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
