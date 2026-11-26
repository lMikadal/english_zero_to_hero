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
  checkpoint: { detection: true, drillActivity: false, touchesProgress: true },
  drill: { detection: false, drillActivity: true, touchesProgress: true },
  retest: { detection: false, drillActivity: true, touchesProgress: true },
  practice: { detection: false, drillActivity: false, touchesProgress: false },
} as const satisfies Record<AttemptSourceLike, SourceRole>;

/** The sources with `role` set, in the order of SOURCE_ROLES. */
export function sourcesWith(role: keyof SourceRole): AttemptSourceLike[] {
  return (Object.keys(SOURCE_ROLES) as AttemptSourceLike[]).filter((s) => SOURCE_ROLES[s][role]);
}

export const hasRole = (source: AttemptSourceLike, role: keyof SourceRole): boolean => SOURCE_ROLES[source][role];
