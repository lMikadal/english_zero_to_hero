"use client";
import type { ReactNode } from "react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { correctAnswerText, gradeExercise, isRetryable, type Grade } from "@/lib/answers/grade";
import { newId, type AttemptAnswer } from "@/lib/attempts/contract";
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
};

export function LessonPlayer({ lesson, vocab, sink, clock = () => performance.now() }: LessonPlayerProps) {
  const [state, dispatch] = useReducer(playerReducer, undefined, () =>
    createPlayerState({ lesson, sessionId: newId(), now: clock(), isSupported: isRegistered }),
  );
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [answered] = useState(() => new Set<string>()); // step keys already sent: one attempt per presentation
  const completing = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const shownKey = useRef<string | null>(null);

  const { sessionId } = state;
  const complete = useCallback(() => {
    setCompletion(null);
    const fail = () => setCompletion({ status: "error" });
    try {
      sink.completeLesson({ day: lesson.day, sessionId, completedAt: new Date().toISOString() }).then(setCompletion, fail);
    } catch {
      fail();
    }
  }, [sink, lesson.day, sessionId]);

  useEffect(() => {
    if (state.phase !== "complete" || completing.current) return;
    completing.current = true;
    complete();
  }, [state.phase, complete]);

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h2 ref={heading} tabIndex={-1} className="flex items-center justify-between text-sm font-normal text-zinc-600 outline-none">
          <span>{item.step.sectionTitle.th}</span>
          <span>ข้อ {x} / {total}</span>
        </h2>
        <div className="h-2 rounded-full bg-zinc-200" aria-hidden>
          <div className="h-2 rounded-full bg-sky-600" style={{ width: `${(x / total) * 100}%` }} />
        </div>
        {isRetryRound(state) && <p className="text-sm font-medium text-amber-800">ทบทวนข้อที่ตอบผิด</p>}
      </header>

      {item.step.supported ? (
        <div key={item.key}>
          {renderExercise(exercise, { vocab, onAnswer, onContinue: skip, result: record?.grade })}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-4">
          <p className="text-lg font-semibold">ยังไม่รองรับ</p>
          <p className="text-sm text-zinc-600">แบบฝึกหัดชนิดนี้ยังเล่นไม่ได้ในเวอร์ชันนี้ ข้ามไปก่อนได้</p>
          <button type="button" onClick={skip} className={`${BTN} border border-zinc-300`}>ข้าม</button>
        </div>
      )}

      <Feedback type={exercise.type} grade={record?.grade} lines={isRetryable(exercise.type) ? correctAnswerText(exercise) : []} />

      {graded && (
        <button type="button" disabled={!canAdvance(state)} onClick={goNext} className={`${BTN} bg-sky-600 text-white disabled:bg-zinc-300 disabled:text-zinc-600`}>
          ถัดไป
        </button>
      )}
    </main>
  );
}

/** One live region, always mounted, so screen readers announce the text when it changes. */
function Feedback({ type, grade, lines }: { type: ExerciseType; grade: Grade | undefined; lines: string[] }) {
  let body: ReactNode = null;
  let tone = "";
  if (grade && !isRetryable(type)) {
    body = "บันทึกแล้ว";
    tone = "bg-zinc-100";
  } else if (grade?.correct) {
    body = <span className="font-semibold">✓ ถูกต้อง</span>;
    tone = "bg-green-100 text-green-900";
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
    tone = "bg-red-100 text-red-900";
  }
  return <div role="status" className={body ? `rounded-lg p-3 ${tone}` : ""}>{body}</div>;
}
