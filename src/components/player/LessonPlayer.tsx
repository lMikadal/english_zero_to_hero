"use client";
import type { ReactNode } from "react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Card } from "@/components/exercises/ui/Card";
import { buttonClass } from "@/components/ui/button-styles";
import { correctAnswerText, gradeExercise, isRetryable, type Grade } from "@/lib/answers/grade";
import {
  newId, type AttemptAnswer, type AttemptInput, type CompleteLessonRequest, type CompletePracticeRequest, type ReplaySkill,
} from "@/lib/attempts/contract";
import type { ExerciseType, Lesson } from "@/lib/content/schema";
import type { SyncSink } from "@/lib/offline/sink";
import { REPLAY_SKILL_LABEL_TH, replaySections } from "@/lib/practice/replay";
import { isRegistered, renderExercise } from "@/components/exercises/registry";
import type { VocabLookup } from "@/components/exercises/types";
import { CompletionScreen, type Completion } from "./CompletionScreen";
import { PracticeCompletionScreen, type PracticeCompletion } from "./PracticeCompletionScreen";
import {
  createPlayerState, currentItem, elapsedMs, canAdvance, firstAttemptScore, isRetryRound, playerReducer, recordsAttempt,
} from "./player-state";

/** lesson = first time through the day; practice = replay of a finished day (docs/plans/replay-plan.md). */
export type PlayerMode = "lesson" | "practice";

/** The one place that turns the mode into the `source` every attempt carries. */
export const attemptSourceFor = (mode: PlayerMode): AttemptInput["source"] => (mode === "practice" ? "practice" : "lesson");

export type LessonPlayerProps = {
  lesson: Lesson;
  /**
   * Read once, when the player mounts, and never again: after the first completion the day page re-renders (router.refresh)
   * with the day now done, and the first-time completion screen must stay. So never put the mode in a React `key`.
   */
  mode?: PlayerMode;
  /** Practice only: the one skill whose sections are played (null/absent = the whole lesson). Remembered at mount like `mode`. */
  skill?: ReplaySkill | null;
  /** Practice only: the learner chose "เล่นอีกครั้ง"; the parent remounts the player for a fresh session. */
  onReplay?(): void;
  vocab: VocabLookup;
  sink: SyncSink;
  /** Monotonic clock in ms; tests pass a fake. */
  clock?: () => number;
  /** Called once when the server has answered `done` (the day page uses it to refresh cached pages). */
  onDone?(): void;
};

export function LessonPlayer({ lesson, mode: modeProp = "lesson", skill: skillProp = null, vocab, sink, clock = () => performance.now(), onDone, onReplay }: LessonPlayerProps) {
  const [mode] = useState(modeProp);
  const [skill] = useState(mode === "practice" ? skillProp : null);
  const [state, dispatch] = useReducer(playerReducer, undefined, () =>
    createPlayerState({
      lesson, sections: mode === "practice" ? replaySections(lesson, skill) : undefined, sessionId: newId(), now: clock(), isSupported: isRegistered,
    }),
  );
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [practiceCompletion, setPracticeCompletion] = useState<PracticeCompletion | null>(null);
  const [answered] = useState(() => new Set<string>()); // step keys already sent: one attempt per presentation
  const completing = useRef(false);
  const request = useRef<CompleteLessonRequest | null>(null); // the same request every time, so asking again is idempotent
  const practiceRequest = useRef<CompletePracticeRequest | null>(null);
  const doneNotified = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const shownKey = useRef<string | null>(null);

  const { sessionId } = state;
  const complete = useCallback(() => {
    if (mode === "practice") {
      setPracticeCompletion(null);
      practiceRequest.current ??= { kind: "replay", day: lesson.day, skill, sessionId, completedAt: new Date().toISOString() };
      const fail = () => setPracticeCompletion({ status: "error" });
      try {
        sink.completePractice(practiceRequest.current).then(setPracticeCompletion, fail);
      } catch {
        fail();
      }
      return;
    }
    setCompletion(null);
    request.current ??= { day: lesson.day, sessionId, completedAt: new Date().toISOString() };
    const fail = () => setCompletion({ status: "error" });
    try {
      sink.completeLesson(request.current).then(setCompletion, fail);
    } catch {
      fail();
    }
  }, [sink, lesson.day, sessionId, mode, skill]);

  useEffect(() => {
    if (state.phase !== "complete" || completing.current) return;
    completing.current = true;
    complete();
  }, [state.phase, complete]);

  // `queued` means the first answer took too long or the network was down; the sink keeps sending and the later
  // success cannot reach this promise. When nothing is pending any more, ask again (the server is idempotent and
  // returns the stored result) so the screen can move on to `done`.
  const queued = (mode === "practice" ? practiceCompletion : completion)?.status === "queued";
  useEffect(() => {
    if (!queued) return;
    let asking = false;
    return sink.subscribe(() => {
      if (asking || sink.pendingCount() > 0) return;
      if (mode === "practice") {
        if (!practiceRequest.current) return;
        asking = true;
        sink.completePractice(practiceRequest.current).then(
          (r) => { if (r.status !== "queued") setPracticeCompletion(r); },
          () => {},
        ).finally(() => { asking = false; });
        return;
      }
      if (!request.current) return;
      asking = true;
      sink.completeLesson(request.current).then(
        (r) => { if (r.status !== "queued") setCompletion(r); },
        () => {},
      ).finally(() => { asking = false; });
    });
  }, [queued, sink, mode]);

  const done = (mode === "practice" ? practiceCompletion : completion)?.status === "done";
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
    if (mode === "practice") {
      return (
        <PracticeCompletionScreen
          day={lesson.day} skill={skill} result={practiceCompletion} localScore={firstAttemptScore(state)}
          selfRated={Object.values(state.answers).some((r) => r.answer.kind === "self")} onRetry={complete} onReplay={onReplay}
        />
      );
    }
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
      source: attemptSourceFor(mode),
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-4">
      <header className="flex flex-col gap-2.5">
        {mode === "practice" && (
          <p className="self-start rounded-full border border-hint/40 bg-hint-soft px-2.5 py-0.5 text-xs font-medium text-hint-fg">
            {skill === null ? "เล่นซ้ำ" : `เล่นซ้ำ · ${REPLAY_SKILL_LABEL_TH[skill]}`}
          </p>
        )}
        <h2 ref={heading} tabIndex={-1} className="flex items-center justify-between text-[13px] font-normal text-muted outline-none">
          <span className="font-medium">{item.step.sectionTitle.th}</span>
          <span>ข้อ {x} / {total}</span>
        </h2>
        <div className="h-1 rounded-full bg-line" aria-hidden>
          <div className="h-1 rounded-full bg-accent" style={{ width: `${(x / total) * 100}%` }} />
        </div>
        {isRetryRound(state) && <p className="text-[13px] font-medium text-hint-fg">ทบทวนข้อที่ตอบผิด</p>}
      </header>

      {item.step.supported ? (
        <div key={item.key} className="flex flex-1 flex-col">
          {renderExercise(exercise, { vocab, onAnswer, onContinue: skip, result: record?.grade })}
        </div>
      ) : (
        <Card pad="p-4" className="flex flex-col gap-3 bg-surface">
          <p className="text-lg font-bold">ยังไม่รองรับ</p>
          <p className="text-sm text-muted">แบบฝึกหัดชนิดนี้ยังเล่นไม่ได้ในเวอร์ชันนี้ ข้ามไปก่อนได้</p>
          <button type="button" onClick={skip} className={buttonClass("secondary")}>ข้าม</button>
        </Card>
      )}

      {/* Sticky bottom bar: the feedback and ถัดไป stay on screen however long the exercise is. mt-auto keeps it at
          the bottom of a short page. The component-owned ตรวจคำตอบ button stays in the content above (at the
          bottom of the step). Once there is feedback the bar becomes a card-coloured panel with a top border. */}
      <div
        data-testid="action-bar"
        className={`sticky bottom-0 mt-auto -mx-5 flex flex-col gap-3 px-5 ${
          record ? "border-t border-line bg-card pt-3.5" : "bg-bg"
        } pb-[max(1.5rem,env(safe-area-inset-bottom))]`}
      >
        <Feedback type={exercise.type} grade={record?.grade} lines={isRetryable(exercise.type) ? correctAnswerText(exercise) : []} />
        {graded && (
          <button type="button" disabled={!canAdvance(state)} onClick={goNext} className={buttonClass("primary")}>
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
    tone = "text-sm text-muted";
  } else if (grade?.correct) {
    body = <span className="text-[15px] font-bold">✓ ถูกต้อง</span>;
    tone = "text-good-fg";
  } else if (grade) {
    body = (
      <>
        <span className="block text-[15px] font-bold">✗ ยังไม่ถูก</span>
        {lines.length > 0 && (
          <>
            <span className="mt-1 block text-[13px] text-muted">คำตอบที่ถูกต้อง</span>
            {lines.map((l, i) => <span key={i} lang="en" className="block break-words text-sm font-medium text-fg">{l}</span>)}
          </>
        )}
      </>
    );
    tone = "text-bad-fg";
  }
  return <div role="status" className={`max-h-[30dvh] overflow-y-auto ${body ? tone : ""}`}>{body}</div>;
}
