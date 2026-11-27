"use client";
// The offline queue is in memory until the IndexedDB queue exists: answers that are still waiting to be sent are
// lost if the tab closes. While something is pending, ask the browser to confirm leaving (the standard
// beforeunload prompt, never alert/confirm) and, for the visible note, tell the learner in Thai.
import { useEffect, useSyncExternalStore } from "react";
import { getSyncSink, type HttpSink } from "@/lib/offline/http-sink";

type SinkView = Pick<HttpSink, "getState" | "subscribe">;

function usePending(sink: SinkView): { pending: number; attempts: number; reviews: number; reviewCompletions: number } {
  const pending = useSyncExternalStore(sink.subscribe, () => sink.getState().pending, () => 0);
  const attempts = useSyncExternalStore(sink.subscribe, () => sink.getState().pendingAttempts, () => 0);
  const reviews = useSyncExternalStore(sink.subscribe, () => sink.getState().pendingReviews, () => 0);
  const reviewCompletions = useSyncExternalStore(sink.subscribe, () => sink.getState().pendingReviewCompletions, () => 0);
  useEffect(() => {
    if (pending === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // legacy browsers need this to show the prompt
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  return { pending, attempts, reviews, reviewCompletions };
}

/** Only the beforeunload guard (used while the lesson is playing, where the note would be noise). */
export function UnsavedGuard({ sink }: { sink?: SinkView }) {
  usePending(sink ?? getSyncSink());
  return null;
}

/**
 * What is unsaved is read from the sink: answers and reviews waiting are counted in their own words, and a completion
 * that is waiting alone is named by its kind (a review completion says so on every page, e.g. the home page). `kind` is
 * only the fallback for a waiting completion the sink does not name; the lesson wording is the default.
 */
export function UnsavedNote({ sink, kind = "lesson" }: { sink?: SinkView; kind?: "lesson" | "review" }) {
  const { pending, attempts, reviews, reviewCompletions } = usePending(sink ?? getSyncSink());
  if (pending === 0) return null;
  const text =
    attempts > 0 ? `มีคำตอบ ${attempts} ข้อที่ยังไม่ได้บันทึก อย่าปิดหน้านี้`
    : reviews > 0 ? `มีผลการทวนคำศัพท์ ${reviews} ใบที่ยังไม่ได้บันทึก อย่าปิดหน้านี้`
    : kind === "review" || reviewCompletions === pending ? "มีผลการทวนคำศัพท์ที่ยังไม่ได้บันทึก อย่าปิดหน้านี้"
    : "มีผลบทเรียนที่ยังไม่ได้บันทึก อย่าปิดหน้านี้";
  return (
    <p role="status" className="rounded-xl border border-hint/40 bg-hint-soft p-3.5 text-[13px] text-hint-fg">
      {text}
    </p>
  );
}
