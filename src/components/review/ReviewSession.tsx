"use client";
// The /review screen (screens 23-24 and the th_en mirror): front -> reveal -> back -> rate, then the next card.
// Time comes from the `now` prop only and the zone from ReviewQueue.timeZone only (guards: eslint.config.mjs, plan 4.4 item 13).
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button-styles";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { newId } from "@/lib/attempts/contract";
import type { SyncSink } from "@/lib/offline/sink";
import type { CompleteReviewRequest, ReviewQueue, ReviewResult } from "@/lib/srs/contract";
import { ratingIntervalLabels } from "@/lib/srs/format";
import { cardKey } from "@/lib/srs/queue";
import { RATING_LABEL_TH, type Rating } from "@/lib/srs/scheduler";
import { CARD_FACES } from "./faces";
import { RatingBar } from "./RatingBar";
import { ReviewCard } from "./ReviewCard";
import { ReviewCompletionScreen, type ReviewCompletion } from "./ReviewCompletionScreen";
import { counterOf, createSession, sessionReducer } from "./session-state";

/** How the server's answer for each review reaches the session: `feed(callback)` returns the unsubscribe function (HttpSink.onReviewResult). */
export type ServerCardFeed = (cb: (r: ReviewResult) => void) => () => void;

export type ReviewSessionProps = {
  queue: ReviewQueue;
  sink: SyncSink;
  /** The one clock: previews, reviewedAt, startedAt and completedAt all come from it. Tests pass a fixed date. */
  now: () => Date;
  serverCards?: ServerCardFeed;
  /** "ทวนต่อ": start again with a fresh queue (a full page load, so the server's queue and a new session id are read). */
  onContinue?(): void;
};

export function ReviewSession({ queue, sink, now, serverCards, onContinue }: ReviewSessionProps) {
  const [state, dispatch] = useReducer(sessionReducer, queue, createSession);
  const [sessionId] = useState(newId); // once per mount
  const [startedAt] = useState(() => now().toISOString());
  const [completion, setCompletion] = useState<ReviewCompletion | null>(null);
  const sent = useRef(new Map<string, string>()); // review id -> card key, to place the server's answer
  const latest = useRef(new Map<string, string>()); // card key -> id of its newest review: an older answer must not overwrite newer local state
  const rated = useRef<unknown>(null); // the card object already rated: one review per presentation
  const request = useRef<CompleteReviewRequest | null>(null); // the same request every time, so asking again is idempotent
  const completing = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const goodButton = useRef<HTMLButtonElement>(null);

  const steps = state.counts[1] + state.counts[2] + state.counts[3] + state.counts[4];
  useEffect(() => {
    // A new card: show it from the top and announce it. Not on the first render (do not steal focus on load).
    if (steps === 0) return;
    window.scrollTo(0, 0);
    heading.current?.focus();
  }, [steps]);

  const side = state.side;
  const refocus = state.refocus;
  useEffect(() => {
    // The card on screen was dropped with its back showing: the rating buttons are gone, so focus would fall to <body>.
    if (refocus > 0) heading.current?.focus();
  }, [refocus]);

  useEffect(() => {
    // The reveal button is gone once the card is turned over: put focus on "ได้" so it does not fall back to <body>.
    if (side === "back") goodButton.current?.focus();
  }, [side]);

  useEffect(() => {
    if (!serverCards) return;
    return serverCards((r) => {
      const key = r.id === null ? undefined : sent.current.get(r.id);
      if (key === undefined || latest.current.get(key) !== r.id) return;
      dispatch(r.status === "rejected" ? { type: "drop", key } : { type: "server", key, card: r.card });
    });
  }, [serverCards]);

  const complete = useCallback(() => {
    setCompletion(null);
    request.current ??= { sessionId, startedAt, completedAt: now().toISOString() };
    const fail = () => setCompletion({ status: "error" });
    try {
      sink.completeReview(request.current).then(setCompletion, fail);
    } catch {
      fail();
    }
  }, [sink, sessionId, startedAt, now]);

  const finished = state.phase === "complete" && state.total > 0;
  useEffect(() => {
    if (!finished || completing.current) return;
    completing.current = true;
    complete();
  }, [finished, complete]);

  // `queued`: the sink keeps sending; when nothing is pending any more, ask again (the server is idempotent) so the screen can move on to `done`.
  const queued = completion?.status === "queued";
  useEffect(() => {
    if (!queued) return;
    let asking = false;
    return sink.subscribe(() => {
      if (asking || sink.pendingCount() > 0 || !request.current) return;
      asking = true;
      sink.completeReview(request.current).then((r) => { if (r.status !== "queued") setCompletion(r); }, () => {}).finally(() => { asking = false; });
    });
  }, [queued, sink]);

  if (state.total === 0) {
    return (
      <StatusScreen
        title="ยังไม่มีคำที่ถึงกำหนดวันนี้"
        actions={<>
          <Link href="/practice" className={buttonClass("primary")}>กลับไปหน้าฝึกเพิ่ม</Link>
          <Link href="/" className={buttonClass("secondary")}>กลับหน้าแรก</Link>
        </>}
      >
        <p className="text-sm leading-relaxed text-muted">คำที่เรียนแล้วจะกลับมาให้ทวนเมื่อถึงกำหนด</p>
      </StatusScreen>
    );
  }
  if (state.phase === "complete") {
    return <ReviewCompletionScreen total={state.total} counts={state.counts} result={completion} onRetry={complete} onContinue={onContinue ?? (() => {})} />;
  }

  const card = state.queue[0];
  const face = CARD_FACES[card.direction];
  const { x, n, fraction } = counterOf(state);
  const back = state.side === "back";
  const labels = back && state.revealedAt ? ratingIntervalLabels(card.state, state.revealedAt, state.timeZone) : null;

  const onRate = (rating: Rating) => {
    if (rated.current === card) return;
    rated.current = card;
    const t = now();
    const id = newId();
    sent.current.set(id, cardKey(card));
    latest.current.set(cardKey(card), id);
    sink.sendReview({ id, sessionId, vocabId: card.vocabId, direction: card.direction, rating, reviewedAt: t.toISOString() });
    dispatch({ type: "rate", rating, now: t });
  };

  const last = state.last;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-4">
      <header className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[13px] text-muted">
          <h1 ref={heading} tabIndex={-1} className="text-[13px] font-medium outline-none">ทวนคำศัพท์</h1>
          <span>{`${x} / ${n}`}</span>
        </div>
        <div className="h-1 rounded-full bg-line" aria-hidden>
          <div className="h-1 rounded-full bg-accent" style={{ width: `${fraction * 100}%` }} />
        </div>
        <p className="text-xs text-muted">{face.label}</p>
      </header>

      <div key={`${cardKey(card)}-${steps}`} className="flex flex-col gap-3.5">
        <ReviewCard item={card} side={state.side} />
        {!back && <p className="px-2 text-center text-[13px] text-muted">{face.hint}</p>}
      </div>

      {/* One primary action at a time: the reveal button on the front, the four ratings on the back. The status is
          always mounted so screen readers announce what the last rating did (guard: ReviewSession.test.tsx). */}
      <div
        data-testid="action-bar"
        className={`sticky bottom-0 mt-auto -mx-5 flex flex-col gap-3 px-5 ${back ? "border-t border-line bg-card pt-3.5" : "bg-bg"} pb-[max(1.5rem,env(safe-area-inset-bottom))]`}
      >
        <div
          role="status"
          className={state.notice ? "rounded-xl border border-hint/40 bg-hint-soft p-3 text-[13px] text-hint-fg" : "sr-only"}
        >
          {state.notice ?? (last && `${RATING_LABEL_TH[last.rating]} · ทวนอีกใน ${last.interval}${last.again ? " · ใบนี้จะกลับมาอีกครั้งในรอบนี้" : ""}`)}
        </div>
        {back && labels ? (
          <RatingBar labels={labels} onRate={onRate} goodRef={goodButton} />
        ) : (
          <button type="button" onClick={() => dispatch({ type: "reveal", now: now() })} className={buttonClass("primary")}>{face.reveal}</button>
        )}
      </div>
    </main>
  );
}

