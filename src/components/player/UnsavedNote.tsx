"use client";
// The offline queue is in memory until the IndexedDB queue exists: answers that are still waiting to be sent are
// lost if the tab closes. While something is pending, ask the browser to confirm leaving (the standard
// beforeunload prompt, never alert/confirm) and, for the visible note, tell the learner in Thai.
import { useEffect, useSyncExternalStore } from "react";
import { getSyncSink, type HttpSink } from "@/lib/offline/http-sink";

type SinkView = Pick<HttpSink, "getState" | "subscribe">;

function usePending(sink: SinkView): { pending: number; attempts: number } {
  const pending = useSyncExternalStore(sink.subscribe, () => sink.getState().pending, () => 0);
  const attempts = useSyncExternalStore(sink.subscribe, () => sink.getState().pendingAttempts, () => 0);
  useEffect(() => {
    if (pending === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // legacy browsers need this to show the prompt
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  return { pending, attempts };
}

/** Only the beforeunload guard (used while the lesson is playing, where the note would be noise). */
export function UnsavedGuard({ sink }: { sink?: SinkView }) {
  usePending(sink ?? getSyncSink());
  return null;
}

export function UnsavedNote({ sink }: { sink?: SinkView }) {
  const { pending, attempts } = usePending(sink ?? getSyncSink());
  if (pending === 0) return null;
  return (
    <p role="status" className="rounded-lg bg-hint-soft p-3 text-sm text-hint-fg">
      {attempts > 0 ? `มีคำตอบ ${attempts} ข้อที่ยังไม่ได้บันทึก อย่าปิดหน้านี้` : "มีผลบทเรียนที่ยังไม่ได้บันทึก อย่าปิดหน้านี้"}
    </p>
  );
}
