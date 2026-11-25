"use client";
// Client boundary for the day page: the sink is created here because functions cannot cross from a server component.
import { useState } from "react";
import type { VocabLookup } from "@/components/exercises/types";
import type { Lesson } from "@/lib/content/schema";
import { LessonPlayer } from "./LessonPlayer";
import { createMemorySink } from "./memory-sink";

export function DayPlayer({ lesson, vocab }: { lesson: Lesson; vocab: VocabLookup }) {
  // TODO(wiring PR): use the real HTTP sink (createHttpSink from src/lib/offline/http-sink.ts) instead.
  const [sink] = useState(createMemorySink);
  return <LessonPlayer lesson={lesson} vocab={vocab} sink={sink} />;
}
