// An AudioSource backed by the browser's speechSynthesis. Client-safe: nothing runs at import time, and on the
// server (no speechSynthesis) the source simply reports "unavailable".
import { AudioUnavailableError, type Accent, type AudioSource, type PlayOptions } from "./source";

type Options = {
  /** Defaults to `globalThis.speechSynthesis`; pass `null` to force "no speech". */
  synth?: SpeechSynthesis | null;
  Utterance?: typeof SpeechSynthesisUtterance;
  /** How long to wait for a browser that loads its voice list late. */
  voicesTimeoutMs?: number;
};

const LANG: Record<Accent, string> = { us: "en-US", uk: "en-GB" };
const norm = (lang: string) => lang.replace("_", "-").toLowerCase();

/** A one-off failure (blocked by autoplay policy, network, busy engine ...). The buttons stay; trying again may work. */
export class AudioPlaybackError extends Error {
  constructor(message = "playback failed") {
    super(message);
    this.name = "AudioPlaybackError";
  }
}

const hasEnglish = (voices: readonly SpeechSynthesisVoice[]) => voices.some((v) => norm(v.lang).startsWith("en"));

/** Exact accent first, then any English; a local (offline) voice before a network one. */
function pickVoice(voices: readonly SpeechSynthesisVoice[], accent: Accent): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => norm(v.lang).startsWith("en"));
  const best = (list: readonly SpeechSynthesisVoice[]) => list.find((v) => v.localService) ?? list[0] ?? null;
  const exact = english.filter((v) => norm(v.lang) === norm(LANG[accent]));
  return best(exact.length > 0 ? exact : english);
}

/** Held so the browser cannot garbage-collect the utterance before it fires `end` (a known Chrome bug). */
let currentUtterance: SpeechSynthesisUtterance | null = null;

export function createSpeechAudioSource(options: Options = {}): AudioSource {
  const timeout = options.voicesTimeoutMs ?? 1000;
  const getSynth = (): SpeechSynthesis | null =>
    options.synth !== undefined ? options.synth : typeof speechSynthesis === "undefined" ? null : speechSynthesis;

  /** Voices, waiting up to `timeout` ms if the list is still empty (Chrome fills it asynchronously). */
  async function loadVoices(synth: SpeechSynthesis): Promise<readonly SpeechSynthesisVoice[]> {
    const now = synth.getVoices();
    if (now.length > 0) return now;
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        synth.removeEventListener("voiceschanged", onChange);
        resolve(synth.getVoices());
      };
      const onChange = () => {
        if (synth.getVoices().length > 0) finish();
      };
      const timer = setTimeout(finish, timeout);
      synth.addEventListener("voiceschanged", onChange);
    });
  }

  return {
    kind: "speech",

    async canPlay() {
      const synth = getSynth();
      if (!synth) return false;
      return hasEnglish(await loadVoices(synth));
    },

    // Not `async`: `speak` must run synchronously inside the tap (mobile browsers drop it otherwise).
    play(text: string, opts: PlayOptions = {}): Promise<void> {
      const synth = getSynth();
      const Utterance = options.Utterance ?? (typeof SpeechSynthesisUtterance === "undefined" ? undefined : SpeechSynthesisUtterance);
      if (!synth || !Utterance) return Promise.reject(new AudioUnavailableError("speechSynthesis is not available"));
      if (opts.signal?.aborted) return Promise.resolve();
      const accent = opts.accent ?? "us";
      const known = synth.getVoices();
      // Voices known and none is English: unavailable. Voices not loaded yet: speak with `lang` only.
      if (known.length > 0 && !hasEnglish(known)) return Promise.reject(new AudioUnavailableError("no English voice"));
      const voice = pickVoice(known, accent);

      const utterance = new Utterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice ? voice.lang.replace("_", "-") : LANG[accent];
      utterance.rate = opts.rate ?? 1;
      return new Promise<void>((resolve, reject) => {
        const settle = () => {
          clearTimeout(timer);
          opts.signal?.removeEventListener("abort", onAbort);
          if (currentUtterance === utterance) currentUtterance = null;
        };
        const onAbort = () => {
          settle();
          synth.cancel();
          resolve();
        };
        utterance.onend = () => {
          settle();
          resolve();
        };
        utterance.onerror = (e) => {
          settle();
          if (e.error === "canceled" || e.error === "interrupted") resolve(); // cancel() is not a failure
          else if (e.error === "language-unavailable" || e.error === "voice-unavailable") reject(new AudioUnavailableError(`speech: ${e.error}`));
          else reject(new AudioPlaybackError(`speech failed: ${e.error}`));
        };
        // Safety net: some engines never fire end/error. Always settle, generously longer than the speech.
        const timer = setTimeout(() => {
          settle();
          synth.cancel();
          resolve();
        }, 5000 + (text.length * 200) / (opts.rate ?? 1));
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        currentUtterance = utterance;
        synth.cancel(); // never overlap two utterances
        synth.resume(); // Chrome can stay paused after a cancel
        synth.speak(utterance);
      });
    },

    stop() {
      getSynth()?.cancel();
    },
  };
}
