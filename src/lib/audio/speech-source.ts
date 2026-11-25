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

function pickVoice(voices: readonly SpeechSynthesisVoice[], accent: Accent): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => norm(v.lang).startsWith("en"));
  return english.find((v) => norm(v.lang) === norm(LANG[accent])) ?? english[0] ?? null;
}

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
      return pickVoice(await loadVoices(synth), "us") !== null;
    },

    async play(text: string, opts: PlayOptions = {}) {
      const synth = getSynth();
      const Utterance = options.Utterance ?? (typeof SpeechSynthesisUtterance === "undefined" ? undefined : SpeechSynthesisUtterance);
      if (!synth || !Utterance) throw new AudioUnavailableError("speechSynthesis is not available");
      const accent = opts.accent ?? "us";
      const voice = pickVoice(await loadVoices(synth), accent);
      if (!voice) throw new AudioUnavailableError("no English voice");
      if (opts.signal?.aborted) return;

      synth.cancel(); // never overlap two utterances
      const utterance = new Utterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = opts.rate ?? 1;
      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          synth.cancel();
          resolve();
        };
        const settle = () => opts.signal?.removeEventListener("abort", onAbort);
        utterance.onend = () => {
          settle();
          resolve();
        };
        utterance.onerror = (e) => {
          settle();
          // cancel() (stop, abort or a newer utterance) is not a failure
          if (e.error === "canceled" || e.error === "interrupted") resolve();
          else reject(new AudioUnavailableError(`speech failed: ${e.error}`));
        };
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        synth.speak(utterance);
      });
    },

    stop() {
      getSynth()?.cancel();
    },
  };
}
