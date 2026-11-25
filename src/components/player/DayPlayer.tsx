"use client";
// Client boundary for the day page: the sink is created here because functions cannot cross from a server component.
import { useState } from "react";
import type { VocabLookup } from "@/components/exercises/types";
import type { Lesson } from "@/lib/content/schema";
import { getSyncSink } from "@/lib/offline/http-sink";
import { LessonPlayer } from "./LessonPlayer";

export function DayPlayer({ lesson, vocab }: { lesson: Lesson; vocab: VocabLookup }) {
  // The one app-wide queue, created on first use in the browser (the lazy initialiser runs once per mount).
  const [sink] = useState(getSyncSink);
  return <LessonPlayer lesson={lesson} vocab={vocab} sink={sink} />;
}
