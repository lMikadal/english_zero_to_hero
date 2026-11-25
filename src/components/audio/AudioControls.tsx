"use client";
// Audio UI shared by the sound-based exercises. `useExerciseAudio` decides once per exercise whether sound works;
// `PlayButtons` play a text (normal and 0.75x); `AudioFallback` is what the learner gets when there is no sound.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AudioUnavailableError } from "@/lib/audio/source";
import { useAudio } from "@/lib/audio/context";

export type ExerciseAudio = {
  /** `checking` counts as available so the buttons are usable at once. */
  unavailable: boolean;
  revealed: boolean;
  reveal(): void;
  reportUnavailable(): void;
};

export const BUTTON = "min-h-11 min-w-11 rounded-lg border border-zinc-300 px-4 py-2 text-base font-medium active:bg-zinc-100 disabled:opacity-50";

export function useExerciseAudio(sampleText: string): ExerciseAudio {
  const { source } = useAudio();
  const [unavailable, setUnavailable] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    source.canPlay(sampleText).then(
      (ok) => { if (!cancelled && !ok) setUnavailable(true); },
      () => { if (!cancelled) setUnavailable(true); },
    );
    return () => {
      cancelled = true;
      source.stop();
    };
  }, [source, sampleText]);

  const reveal = useCallback(() => setRevealed(true), []);
  const reportUnavailable = useCallback(() => setUnavailable(true), []);
  return { unavailable, revealed, reveal, reportUnavailable };
}

export function PlayButtons({ audio, text, label = "ฟัง" }: { audio: ExerciseAudio; text: string; label?: string }) {
  const { source, accent } = useAudio();
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  if (audio.unavailable) return null;

  const play = (rate: 0.75 | 1) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    source.play(text, { rate, accent, signal: ac.signal }).catch((e: unknown) => {
      if (e instanceof AudioUnavailableError) audio.reportUnavailable();
    });
  };

  return (
    <span className="inline-flex flex-wrap gap-2">
      <button type="button" className={BUTTON} onClick={() => play(1)}>{label}</button>
      <button type="button" className={BUTTON} onClick={() => play(0.75)}>{label}ช้า 0.75×</button>
    </span>
  );
}

/** Shown only when sound is not available. `children` is the text to reveal (hidden until "แสดงข้อความ"). */
export function AudioFallback({
  audio, onSkip, revealable = true, children,
}: { audio: ExerciseAudio; onSkip(): void; revealable?: boolean; children?: ReactNode }) {
  if (!audio.unavailable) return null;
  return (
    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      <p>อุปกรณ์นี้ไม่มีเสียงภาษาอังกฤษ</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {revealable && !audio.revealed && (
          <button type="button" className={BUTTON} onClick={audio.reveal}>แสดงข้อความ</button>
        )}
        <button type="button" className={BUTTON} onClick={onSkip}>ข้าม</button>
      </div>
      {revealable && audio.revealed && <div className="mt-2 text-base font-medium text-zinc-900">{children}</div>}
    </div>
  );
}
