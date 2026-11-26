"use client";
// Audio UI shared by the sound-based exercises. `useExerciseAudio` decides once per exercise whether sound works;
// `PlayButtons` play a text (normal and 0.75x); `AudioFallback` is what the learner gets when there is no sound.
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioUnavailableError } from "@/lib/audio/source";
import { useAudio } from "@/lib/audio/context";

export type ExerciseAudio = {
  /** True until `canPlay` has answered; the buttons are shown disabled so nothing shifts when it does. */
  checking: boolean;
  unavailable: boolean;
  reportUnavailable(): void;
};

export const BUTTON = "min-h-11 min-w-11 rounded-lg border border-line px-4 py-2 text-base font-medium active:bg-surface disabled:opacity-50";

export function useExerciseAudio(sampleText: string): ExerciseAudio {
  const { source } = useAudio();
  const [unavailable, setUnavailable] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    source.canPlay(sampleText).then(
      (ok) => { if (!cancelled) { setChecking(false); if (!ok) setUnavailable(true); } },
      () => { if (!cancelled) { setChecking(false); setUnavailable(true); } },
    );
    return () => {
      cancelled = true;
      source.stop();
    };
  }, [source, sampleText]);

  const reportUnavailable = useCallback(() => setUnavailable(true), []);
  return { checking, unavailable, reportUnavailable };
}

export function PlayButtons({ audio, text, label = "ฟัง" }: { audio: ExerciseAudio; text: string; label?: string }) {
  const { source, accent } = useAudio();
  const abort = useRef<AbortController | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => () => abort.current?.abort(), []);
  if (audio.unavailable) return null;

  const play = (rate: 0.75 | 1) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setFailed(false);
    source.play(text, { rate, accent, signal: ac.signal }).catch((e: unknown) => {
      if (e instanceof AudioUnavailableError) audio.reportUnavailable();
      else setFailed(true); // a one-off failure: keep the buttons
    });
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex flex-wrap gap-2">
        <button type="button" disabled={audio.checking} className={BUTTON} onClick={() => play(1)}>{label}</button>
        <button type="button" disabled={audio.checking} className={BUTTON} onClick={() => play(0.75)}>{label}ช้า 0.75×</button>
      </span>
      {failed && <span role="status" className="text-sm text-bad-fg">เล่นเสียงไม่สำเร็จ ลองอีกครั้ง</span>}
    </span>
  );
}

/** For graded sound exercises, which are skipped (not scored) without sound. */
export const GRADED_NO_AUDIO_NOTE = "อุปกรณ์นี้ยังเล่นเสียงภาษาอังกฤษไม่ได้ ข้ามข้อนี้ไปก่อน";
export const NO_AUDIO_NOTE = "อุปกรณ์นี้ไม่มีเสียงภาษาอังกฤษ";

/**
 * Shown only when sound is not available: a Thai note and, when `onSkip` is given, "ข้าม". There is deliberately no
 * way to reveal a transcript: for the graded sound exercises that would give the answer away.
 */
export function AudioFallback({ audio, onSkip, note = NO_AUDIO_NOTE }: { audio: ExerciseAudio; onSkip?: () => void; note?: string }) {
  if (!audio.unavailable) return null;
  return (
    <div className="rounded-lg bg-hint-soft p-3 text-sm text-hint-fg">
      <p>{note}</p>
      {onSkip && (
        <div className="mt-2">
          <button type="button" className={BUTTON} onClick={onSkip}>ข้าม</button>
        </div>
      )}
    </div>
  );
}
