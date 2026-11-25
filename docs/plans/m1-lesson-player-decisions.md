# Lesson player: decisions that override or extend the architect plan

Read together with `m1-lesson-player-plan.md` in this folder. Where they disagree, THIS file wins.
The user decided items 1-4 on 2026-11-25; items 5-8 are orchestrator decisions.

1. Speaking exercises (`repeat_after_me`, `shadowing`, `speak_answer`): self-rating ("พูดได้" / "ยังไม่คล่อง")
   is recorded but does NOT count as a score. Store `answer = {kind: "self", rating, recordingId?}`,
   `score = null`, and `correct = (rating === "ok")`. Anything with `score === null` (self-rated speaking,
   `free_write`) is excluded from lesson score, weakness detection and skill accuracy.
2. Wrong answers: one try, reveal the correct answer immediately, move on; every exercise answered wrong
   comes back ONCE in a retry round at the end of the lesson (before the completion screen). Scores and
   weak points use the FIRST attempt only. Retry attempts are recorded with `attemptNo = 2`.
   => `attempts` gains a column `attempt_no smallint NOT NULL DEFAULT 1 CHECK (attempt_no BETWEEN 1 AND 2)`
   (new migration, owned by task A / backend). The contract's `attemptInputSchema` gains
   `attemptNo: z.union([z.literal(1), z.literal(2)]).default(1)`. Speaking self-ratings and `free_write`
   are never retried. A lesson can be completed after the retry round whatever the retry results are.
3. Lessons are locked in order: a day is playable only if `day <= profiles.current_day`
   (`current_day` = highest completed day + 1, so finished days can be replayed and several lessons can be
   done in one calendar day, in order). The day page shows a locked screen with a link to the current day
   for later days; `POST /api/attempts` rejects items for a locked day with `reason: "locked_day"`, and
   `POST /api/lessons/complete` returns 409 for a locked day.
4. Streak: a calendar day (user timezone) counts when a lesson is completed OR all vocabulary reviews due
   that day are done. In this slice only lesson completion calls `touchStreak`; the SRS PR adds the second
   trigger using the same function.
5. Answer normaliser: accept the architect's rule (lower-case; curly apostrophes to '; remove . ! ? ,
   anywhere; collapse and trim whitespace). Document it in docs/CONTENT_SCHEMA.md.
6. `progress.score`, `attempts.score` and checkpoint scores are fractions 0..1 everywhere. Document it in
   docs/ARCHITECTURE.md §4.
7. Running Docker from worktrees: only one agent at a time may run integration tests (`make test` /
   `make check`) and only from the main checkout. Agents in worktrees run unit tests, lint and typecheck with
   `docker compose -p english_zero_to_hero run --rm --no-deps -T app pnpm <test:unit|lint|typecheck>`
   from their worktree, never `make`.
8. The prod image must copy `content/` (noted for the self-host deploy PR); nothing to do in this slice
   beyond adding the item to docs/PLAN.md.
