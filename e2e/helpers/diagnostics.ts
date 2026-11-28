// Pure helpers behind the lesson player's E2E waits (no Playwright import, so Vitest checks them in `make check`).
//
// Why this exists: on CI the lesson spec twice failed with only 'Expected: not "pending"' (docs/PLAN.md, "E2E ไม่นิ่ง").
// That message names neither the step nor the screen. These helpers decide the audio state from plain values and turn a
// timeout into a message that says where the player was, what was on screen and whether the page had loaded again.

export type AudioMode = "skip" | "audio" | "pending";

/**
 * The audio state of the exercise on screen, from values that were read WITHOUT waiting:
 * - "skip": the "ข้าม" button is visible (the device has no English voice),
 * - "audio": a "ฟัง" button exists and the first one is enabled,
 * - "pending": neither yet (the player is still asking the browser for voices: the "ฟัง" buttons are disabled, or absent).
 * `playDisabled` has one entry per "ฟัง" button currently in the page, in document order.
 */
export function classifyAudio(skipVisible: boolean, playDisabled: readonly boolean[]): AudioMode {
  if (skipVisible) return "skip";
  if (playDisabled.length > 0 && playDisabled[0] === false) return "audio";
  return "pending";
}

export type ScreenReport = {
  /** What the helper was doing, e.g. "waiting for the audio check". */
  doing: string;
  exerciseId: string;
  exerciseType: string;
  /** The Thai instruction the exercise was matched by. */
  instruction: string;
  /** "ข้อ x / y" as read before the step was played, and as read now ("?" if it could not be read). */
  stepBefore: string;
  stepNow: string;
  url: string;
  /** Buttons on screen, e.g. 'ฟัง (disabled)'. */
  buttons: readonly string[];
  /** Text of <main>, whitespace collapsed. */
  mainText: string;
  /** Full page loads seen since the lesson started playing (the first load of the page is not counted). */
  loads: number;
  /** Console errors/warnings, uncaught page errors, failed requests and 4xx/5xx answers seen so far (newest last). */
  events: readonly string[];
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}...` : s);

/** One readable block for an error message and for the test report attachment. */
export function formatDiagnostics(r: ScreenReport): string {
  const reloaded =
    r.loads === 0
      ? "the page had NOT loaded again (no reload)"
      : `the page LOADED AGAIN ${r.loads} time(s): the player restarts at step 1 on a reload`;
  const lines = [
    `while ${r.doing}`,
    `exercise: ${r.exerciseId} (${r.exerciseType}), instruction "${r.instruction}"`,
    `step: ${r.stepBefore} when it started, ${r.stepNow} now; url ${r.url}`,
    reloaded,
    `buttons on screen: ${r.buttons.length > 0 ? r.buttons.join(", ") : "(none)"}`,
    `text of <main>: ${clip(r.mainText, 400) || "(empty)"}`,
    `browser events (${r.events.length}): ${r.events.length > 0 ? r.events.slice(-8).map((e) => clip(e, 200)).join(" | ") : "none"}`,
  ];
  return lines.join("\n");
}
