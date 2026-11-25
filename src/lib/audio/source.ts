// Where exercise audio comes from. Client-safe. A speechSynthesis-backed source and a file-backed source
// (with the speech one as fallback) implement this in later PRs.
export type Accent = "us" | "uk";
export type PlayOptions = { rate?: 0.75 | 1; accent?: Accent; signal?: AbortSignal };

export class AudioUnavailableError extends Error {
  constructor(message = "audio is not available") {
    super(message);
    this.name = "AudioUnavailableError";
  }
}

export interface AudioSource {
  readonly kind: "file" | "speech" | "none";
  canPlay(text: string): Promise<boolean>;
  /** Resolves when playback ends; rejects with AudioUnavailableError when nothing can be played. */
  play(text: string, opts?: PlayOptions): Promise<void>;
  stop(): void;
}

/** The default source (and the one tests use): silent, `canPlay` is always false. */
export function createSilentAudioSource(): AudioSource {
  return {
    kind: "none",
    canPlay: async () => false,
    play: async () => {
      throw new AudioUnavailableError();
    },
    stop: () => {},
  };
}
