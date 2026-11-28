"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Card } from "@/components/exercises/ui/Card";
import { CheckLabelContext } from "@/components/exercises/ui/CheckButton";
import { isRegistered, renderExercise } from "@/components/exercises/registry";
import type { VocabLookup } from "@/components/exercises/types";
import { PlayerFrame } from "@/components/player/PlayerFrame";
import { createPlayerState, currentItem, canAdvance, elapsedMs, playerReducer, recordsAttempt } from "@/components/player/player-state";
import { buttonClass } from "@/components/ui/button-styles";
import { newId, type AttemptAnswer, type CompleteCheckpointRequest } from "@/lib/attempts/contract";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import type { SyncSink } from "@/lib/offline/sink";
import { CheckpointResult } from "./CheckpointResult";
import { completionOf } from "./view";

const FEEDBACK_ID = "step-feedback";
/**
 * What the exercise is given once its answer is stored: the same value for every answer, so it can lock and show nothing.
 * The sitting is never graded on the device and the server returns no grade for a checkpoint answer.
 */
const SAVED = { correct: true, score: 1 } as const;

export type CheckpointPlayerProps = {
  checkpoint: Checkpoint;
  vocab: VocabLookup;
  sink: SyncSink;
  /** One per sitting; a resumed sitting passes the stored one. */
  sessionId: string;
  /** Exercises whose answers the server already has (resume): not asked again, still counted. */
  skipIds?: ReadonlySet<string>;
  /** "<day>:<skill>" of the replay links already played after this sitting (the result screen ticks them). */
  practised: ReadonlySet<string>;
  /** Monotonic clock in ms; tests pass a fake. */
  clock?: () => number;
  /** Called once when the server has answered `done` (the page refreshes its cached copies). */
  onDone?(): void;
  /** The server has no answers for this sitting (409): start a NEW sitting with a new session id. */
  onRestart(): void;
};

/**
 * Plays a monthly checkpoint (docs/plans/checkpoint-plan.md 3.3): one exercise at a time, no going back, no right or wrong
 * anywhere (D5), no retry round. Every answer goes out once as a `checkpoint` attempt; the bottom bar only says that it was
 * saved. After the last exercise it completes the sitting and shows the result.
 */
export function CheckpointPlayer({ checkpoint, vocab, sink, sessionId, skipIds, practised, clock = () => performance.now(), onDone, onRestart }: CheckpointPlayerProps) {
  const [state, dispatch] = useReducer(playerReducer, undefined, () =>
    createPlayerState({ lesson: checkpoint, sessionId, now: clock(), isSupported: isRegistered, retry: false, skipIds }),
  );
  const [result, setResult] = useState<Parameters<typeof completionOf>[0]>(null);
  const [sent] = useState(() => new Set<string>()); // step keys already sent: one answer per exercise per sitting
  const completing = useRef(false);
  const request = useRef<CompleteCheckpointRequest | null>(null); // the same request every time, so asking again is idempotent
  const doneNotified = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const shownKey = useRef<string | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);

  const complete = useCallback(() => {
    setResult(null);
    request.current ??= { afterDay: checkpoint.afterDay, sessionId, completedAt: new Date().toISOString() };
    const fail = () => setResult({ status: "error" });
    try {
      sink.completeCheckpoint(request.current).then(setResult, fail);
    } catch {
      fail();
    }
  }, [sink, checkpoint.afterDay, sessionId]);

  useEffect(() => {
    if (state.phase !== "complete" || completing.current) return;
    completing.current = true;
    complete();
  }, [state.phase, complete]);

  // `queued`: the sink keeps sending; when nothing is pending any more ask again (the server is idempotent) to reach `done`.
  const queued = result?.status === "queued";
  useEffect(() => {
    if (!queued) return;
    let asking = false;
    return sink.subscribe(() => {
      if (asking || sink.pendingCount() > 0 || !request.current) return;
      asking = true;
      sink.completeCheckpoint(request.current).then((r) => { if (r.status !== "queued") setResult(r); }, () => {}).finally(() => { asking = false; });
    });
  }, [queued, sink]);

  const done = result?.status === "done";
  useEffect(() => {
    if (!done || doneNotified.current) return;
    doneNotified.current = true;
    onDone?.();
  }, [done, onDone]);

  const stepKey = state.phase === "playing" ? currentItem(state).key : null;
  useEffect(() => {
    // New step: show it from the top and announce it. Not on the first render (do not steal focus on load).
    if (stepKey === null) return;
    if (shownKey.current !== null && shownKey.current !== stepKey) {
      window.scrollTo(0, 0);
      heading.current?.focus();
    }
    shownKey.current = stepKey;
  }, [stepKey]);

  const hasRecord = stepKey !== null && stepKey in state.answers;
  useEffect(() => {
    // The button that was just pressed is gone once the answer is stored: move focus on to ถัดไป on purpose.
    if (hasRecord) nextButton.current?.focus();
  }, [hasRecord, stepKey]);

  if (state.phase === "complete") {
    return <CheckpointResult checkpoint={checkpoint} completion={completionOf(result)} practised={practised} onRetry={complete} onRestart={onRestart} />;
  }

  const item = currentItem(state);
  const { exercise } = item.step;
  const record = state.answers[item.key];
  const stores = recordsAttempt(item);

  const onAnswer = (answer: AttemptAnswer) => {
    if (!stores || record || sent.has(item.key)) return;
    sent.add(item.key);
    sink.sendAttempt({
      id: newId(),
      exerciseId: exercise.id,
      sessionId: state.sessionId,
      source: "checkpoint",
      attemptNo: 1,
      answer,
      durationMs: elapsedMs(state, clock()),
      createdAt: new Date().toISOString(),
    });
    dispatch({ type: "answer", key: item.key, answer, grade: SAVED, now: clock() });
  };
  const goNext = () => dispatch({ type: "next", key: item.key, now: clock() });
  const skip = () => dispatch({ type: "skip", key: item.key, now: clock() });

  return (
    <CheckLabelContext.Provider value="ยืนยันคำตอบ">
      <PlayerFrame
        headingRef={heading}
        title={item.step.sectionTitle.th}
        x={state.index + 1}
        total={state.items.length}
        answered={Boolean(record)}
        badge={<p className="self-start rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">แบบทดสอบประจำเดือน</p>}
        bar={
          <>
            <div id={FEEDBACK_ID} role="status" className="text-sm text-muted">{record ? "บันทึกคำตอบแล้ว" : ""}</div>
            {stores && record && (
              <button
                ref={nextButton}
                type="button"
                disabled={!canAdvance(state)}
                onClick={goNext}
                aria-describedby={FEEDBACK_ID}
                // a held Enter submitted the form and focus moved here in the same keydown: the repeat must not skip the step
                onKeyDown={(e) => { if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault(); }}
                className={buttonClass("primary")}
              >
                ถัดไป
              </button>
            )}
          </>
        }
      >
        {item.step.supported ? (
          <div key={item.key} className="flex flex-1 flex-col">
            {renderExercise(exercise, { vocab, onAnswer, onContinue: skip, result: record?.grade, reveal: false })}
          </div>
        ) : (
          <Card pad="p-4" className="flex flex-col gap-3 bg-surface">
            <p className="text-lg font-bold">ยังไม่รองรับ</p>
            <p className="text-sm text-muted">แบบฝึกหัดชนิดนี้ยังเล่นไม่ได้ในเวอร์ชันนี้ ข้ามไปก่อนได้</p>
            <button type="button" onClick={skip} className={buttonClass("secondary")}>ข้าม</button>
          </Card>
        )}
      </PlayerFrame>
    </CheckLabelContext.Provider>
  );
}
