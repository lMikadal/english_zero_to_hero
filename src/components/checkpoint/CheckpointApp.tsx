"use client";
// Client boundary of /checkpoint/[n]: the sink is created here (functions cannot cross from a server component), and the
// screen the learner is on (intro, playing, result) is state that is read ONCE at mount. After the sitting is done the page
// refreshes (router.refresh()) and the server sends new props (a stored result, "taken today"): the screen must not move
// because of them, so none of that state is a React key (the same risk as the replay player, plan R1).
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { VocabLookup } from "@/components/exercises/types";
import { UnsavedGuard } from "@/components/player/UnsavedNote";
import { newId } from "@/lib/attempts/contract";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import { getSyncSink } from "@/lib/offline/http-sink";
import { CheckpointIntro } from "./CheckpointIntro";
import { CheckpointPlayer } from "./CheckpointPlayer";
import { CheckpointResult } from "./CheckpointResult";
import type { ResultDisplay } from "./view";

export type CheckpointAppProps = {
  checkpoint: Checkpoint;
  vocab: VocabLookup;
  /** A sitting left open (server answers of the last 24 hours), else null. */
  resume: { sessionId: string; answered: string[] } | null;
  /** The latest finished sitting (for "ครั้งล่าสุด"), else null. */
  last: { score: number; passed: boolean } | null;
  /** The latest sitting finished today in the learner's zone: the page shows its result and no way to start (D4). */
  completedToday: boolean;
  /** What to show for that stored result. */
  latest: ResultDisplay | null;
  /** "<day>:<skill>" of the replay links played after the latest sitting. Read live: the refresh brings new ones. */
  practised: string[];
};

type Screen =
  | { kind: "intro" }
  | { kind: "playing"; sessionId: string; skip: ReadonlySet<string> }
  | { kind: "stored" };

export function CheckpointApp({ checkpoint, vocab, resume, last, completedToday, latest, practised }: CheckpointAppProps) {
  const [screen, setScreen] = useState<Screen>(() => (completedToday && latest ? { kind: "stored" } : { kind: "intro" }));
  const [sink] = useState(getSyncSink);
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const ticks = new Set(practised);

  const start = () =>
    setScreen(resume ? { kind: "playing", sessionId: resume.sessionId, skip: new Set(resume.answered) } : { kind: "playing", sessionId: newId(), skip: new Set() });
  // The server has no answers for this sitting: a NEW one, from the first exercise, under a new session id.
  const restart = useCallback(() => setScreen({ kind: "playing", sessionId: newId(), skip: new Set() }), []);

  return (
    <>
      <UnsavedGuard />
      {screen.kind === "intro" && <CheckpointIntro checkpoint={checkpoint} resume={resume} last={last} onStart={start} />}
      {screen.kind === "playing" && (
        <CheckpointPlayer
          key={screen.sessionId} checkpoint={checkpoint} vocab={vocab} sink={sink} sessionId={screen.sessionId} skipIds={screen.skip}
          practised={ticks} onDone={refresh} onRestart={restart}
        />
      )}
      {screen.kind === "stored" && latest && (
        <CheckpointResult checkpoint={checkpoint} completion={{ kind: "shown", display: latest }} practised={ticks} onRetry={() => {}} onRestart={() => {}} />
      )}
    </>
  );
}
