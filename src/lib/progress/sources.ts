// Every attempt source is classified here, once. Adding a source to AttemptSourceLike without classifying it is a
// compile error, so no formula can silently count (or ignore) a new source by accident.
import type { AttemptSourceLike } from "./types";

export type SourceRole = {
  /** counts as evidence of a weakness (docs/PROGRESS.md 3) */
  detection: boolean;
  /** is drill/retest activity (opens and closes drill cycles, 3.1) */
  drillActivity: boolean;
  /** the attempts handler may start or update the day's progress row for it */
  touchesProgress: boolean;
};

export const SOURCE_ROLES = {
  lesson: { detection: true, drillActivity: false, touchesProgress: true },
  // a checkpoint is its own thing: the first answer to an exercise is evidence, but it never writes `progress`
  checkpoint: { detection: true, drillActivity: false, touchesProgress: false },
  drill: { detection: false, drillActivity: true, touchesProgress: true },
  retest: { detection: false, drillActivity: true, touchesProgress: true },
  practice: { detection: false, drillActivity: false, touchesProgress: false },
  // every later answer to a checkpoint exercise (a second sitting): the exercises are asked again, so it is not new evidence (D11)
  checkpoint_retake: { detection: false, drillActivity: false, touchesProgress: false },
} as const satisfies Record<AttemptSourceLike, SourceRole>;

/** The sources with `role` set, in the order of SOURCE_ROLES. */
export function sourcesWith(role: keyof SourceRole): AttemptSourceLike[] {
  return (Object.keys(SOURCE_ROLES) as AttemptSourceLike[]).filter((s) => SOURCE_ROLES[s][role]);
}

export const hasRole = (source: AttemptSourceLike, role: keyof SourceRole): boolean => SOURCE_ROLES[source][role];
