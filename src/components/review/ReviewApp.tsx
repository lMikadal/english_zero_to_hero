"use client";
// Client boundary for the review page: the sink and the real clock are created here (functions cannot cross from a server component).
import { useState } from "react";
import { UnsavedGuard } from "@/components/player/UnsavedNote";
import { getSyncSink } from "@/lib/offline/http-sink";
import type { ReviewQueue } from "@/lib/srs/contract";
import { ReviewSession } from "./ReviewSession";

// The one place the browser's clock is read; everything below takes `now` as a prop.
// eslint-disable-next-line no-restricted-syntax
const clock = () => new Date();
// "ทวนต่อ": a full page load, so the queue is read again from the server and the session id is new.
// (router.refresh would keep the client state, and a client navigation to the same URL would not remount the session)
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
const reload = () => { window.location.href = "/review"; };

export function ReviewApp({ queue }: { queue: ReviewQueue }) {
  const [sink] = useState(getSyncSink);
  return (
    <>
      <UnsavedGuard />
      <ReviewSession queue={queue} sink={sink} now={clock} serverCards={sink.onReviewResult} onContinue={reload} />
    </>
  );
}
