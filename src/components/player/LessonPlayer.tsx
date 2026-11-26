"use client";
import type { ReactNode } from "react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { correctAnswerText, gradeExercise, isRetryable, type Grade } from "@/lib/answers/grade";
import { newId, type AttemptAnswer, type CompleteLessonRequest } from "@/lib/attempts/contract";
import type { ExerciseType, Lesson } from "@/lib/content/schema";
import type { SyncSink } from "@/lib/offline/sink";
import { isRegistered, renderExercise } from "@/components/exercises/registry";
import type { VocabLookup } from "@/components/exercises/types";
import { CompletionScreen, type Completion } from "./CompletionScreen";
import {
  createPlayerState, currentItem, elapsedMs, canAdvance, firstAttemptScore, isRetryRound, playerReducer, recordsAttempt,
} from "./player-state";

const BTN = "min-h-11 w-full rounded-lg px-4 py-2 text-base font-semibold";

export type LessonPlayerProps = {
  lesson: Lesson;
  vocab: VocabLookup;
  sink: SyncSink;
  /** Monotonic clock in ms; tests pass a fake. */
  clock?: () => number;
  /** Called once when the server has answered `done` (the day page uses it to refresh cached pages). */
  onDone?(): void;
};

export function LessonPlayer({ lesson, vocab, sink, clock = () => performance.now(), onDone }: LessonPlayerProps) {
  const [state, dispatch] = useReducer(playerReducer, undefined, () =>
    createPlayerState({ lesson, sessionId: newId(), now: clock(), isSupported: isRegistered }),
  );
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [answered] = useState(() => new Set<string>()); // step keys already sent: one attempt per presentation
  const completing = useRef(false);
  const request = useRef<CompleteLessonRequest | null>(null); // the same request every time, so asking again is idempotent
  const doneNotified = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const shownKey = useRef<string | null>(null);

  const { sessionId } = state;
  const complete = useCallback(() => {
    setCompletion(null);
    request.current ??= { day: lesson.day, sessionId, completedAt: new Date().toISOString() };
    const fail = () => setCompletion({ status: "error" });
    try {
      sink.completeLesson(request.current).then(setCompletion, fail);
    } catch {
      fail();
    }
  }, [sink, lesson.day, sessionId]);

  useEffect(() => {
    if (state.phase !== "complete" || completing.current) return;
    completing.current = true;
    complete();
  }, [state.phase, complete]);

  // `queued` means the first answer took too long or the network was down; the sink keeps sending and the later
  // success cannot reach this promise. When nothing is pending any more, ask again (the server is idempotent and
  // returns the stored result) so the screen can move on to `done`.
  const queued = completion?.status === "queued";
  useEffect(() => {
    if (!queued) return;
    let asking = false;
    return sink.subscribe(() => {
      if (asking || sink.pendingCount() > 0 || !request.current) return;
      asking = true;
      sink.completeLesson(request.current).then(
        (r) => { if (r.status !== "queued") setCompletion(r); },
        () => {},
      ).finally(() => { asking = false; });
    });
  }, [queued, sink]);

  const done = completion?.status === "done";
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

  if (state.phase === "complete") {
    return <CompletionScreen day={lesson.day} result={completion} localScore={firstAttemptScore(state)} onRetry={complete} />;
  }

  const item = currentItem(state);
  const { exercise } = item.step;
  const record = state.answers[item.key];
  const graded = recordsAttempt(item);

  const onAnswer = (answer: AttemptAnswer) => {
    if (!graded || record || answered.has(item.key)) return; // one attempt per exercise per round
    const grade = gradeExercise(exercise, answer);
    if ("error" in grade) {
      // a component produced an answer the contract rejects: never strand the learner on it
      console.error(`Cannot grade ${exercise.id}: ${grade.error}`);
      dispatch({ type: "broken", key: item.key });
      return;
    }
    answered.add(item.key);
    const now = clock();
    sink.sendAttempt({
      id: newId(),
      exerciseId: exercise.id,
      sessionId: state.sessionId,
      source: "lesson",
      attemptNo: item.attemptNo,
      answer,
      durationMs: elapsedMs(state, now),
      createdAt: new Date().toISOString(),
    });
    dispatch({ type: "answer", key: item.key, answer, grade, now });
  };
  const goNext = () => dispatch({ type: "next", key: item.key, now: clock() });
  const skip = () => dispatch({ type: "skip", key: item.key, now: clock() });

  const position = state.items.filter((i) => i.attemptNo === item.attemptNo);
  const x = position.indexOf(item) + 1;
  const total = position.length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-4">
      <header className="flex flex-col gap-1">
        <h2 ref={heading} tabIndex={-1} className="flex items-center justify-between text-sm font-normal text-muted outline-none">
          <span>{item.step.sectionTitle.th}</span>
          <span>ข้อ {x} / {total}</span>
        </h2>
        <div className="h-2 rounded-full bg-line" aria-hidden>
          <div className="h-2 rounded-full bg-accent" style={{ width: `${(x / total) * 100}%` }} />
        </div>
        {isRetryRound(state) && <p className="text-sm font-medium text-hint-fg">ทบทวนข้อที่ตอบผิด</p>}
      </header>

      {item.step.supported ? (
        <div key={item.key}>
          {renderExercise(exercise, { vocab, onAnswer, onContinue: skip, result: record?.grade })}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
          <p className="text-lg font-semibold">ยังไม่รองรับ</p>
          <p className="text-sm text-muted">แบบฝึกหัดชนิดนี้ยังเล่นไม่ได้ในเวอร์ชันนี้ ข้ามไปก่อนได้</p>
          <button type="button" onClick={skip} className={`${BTN} border border-line`}>ข้าม</button>
        </div>
      )}

      {/* Sticky bottom bar: the feedback and ถัดไป stay on screen however long the exercise is. mt-auto keeps it at
          the bottom of a short page. The component-owned ตรวจคำตอบ button stays in the content above. */}
      <div
        data-testid="action-bar"
        className={`sticky bottom-0 mt-auto -mx-4 flex flex-col gap-3 bg-bg px-4 ${
          graded || record ? "border-t border-line pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" : "pb-[max(1rem,env(safe-area-inset-bottom))]"
        }`}
      >
        <Feedback type={exercise.type} grade={record?.grade} lines={isRetryable(exercise.type) ? correctAnswerText(exercise) : []} />
        {graded && (
          <button type="button" disabled={!canAdvance(state)} onClick={goNext} className={`${BTN} bg-accent text-on-accent disabled:bg-surface disabled:text-muted`}>
            ถัดไป
          </button>
        )}
      </div>
    </main>
  );
}

/** One live region, always mounted, so screen readers announce the text when it changes. */
function Feedback({ type, grade, lines }: { type: ExerciseType; grade: Grade | undefined; lines: string[] }) {
  let body: ReactNode = null;
  let tone = "";
  if (grade && !isRetryable(type)) {
    body = "บันทึกแล้ว";
    tone = "bg-surface";
  } else if (grade?.correct) {
    body = <span className="font-semibold">✓ ถูกต้อง</span>;
    tone = "bg-good-soft text-good-fg";
  } else if (grade) {
    body = (
      <>
        <span className="block font-semibold">✗ ยังไม่ถูก</span>
        {lines.length > 0 && (
          <>
            <span className="block text-sm">คำตอบที่ถูกต้อง</span>
            {lines.map((l, i) => <span key={i} lang="en" className="block font-medium">{l}</span>)}
          </>
        )}
      </>
    );
    tone = "bg-bad-soft text-bad-fg";
  }
  return <div role="status" className={body ? `max-h-[30dvh] overflow-y-auto rounded-lg p-3 ${tone}` : "max-h-[30dvh] overflow-y-auto"}>{body}</div>;
}
