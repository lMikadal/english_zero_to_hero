I've written a plan for the first usable slice: a learner plays day 1 at 360px and their attempts and lesson completion are saved in PostgreSQL. It needs no new packages, no `src/db/schema.ts` change, no migration and no `Makefile`, compose or root-layout edits. This is read-only work: I ran nothing and changed no files.

The order is one contract PR (task 0), then three parallel PRs (A, B1, B2), then a small wiring PR (C).

## 1. Key decisions

- **User identity in M1:** one seeded local user, id `"local"`, looked up only on the server through `getCurrentUserId()` in `src/lib/server/current-user.ts`.
  - On first call it creates the `user` row and a `profiles` row (start date = today in Asia/Bangkok), and is safe to call twice.
  - Reason: Better Auth in M2 only changes the inside of that one function, and every table already has `user_id`.
- **Lesson loading:** server component `src/app/(learn)/day/[day]/page.tsx` reads the lesson from disk at request time and passes the lesson plus the vocab entries it needs to a client `LessonPlayer`.
  - Reason: the attempts API must also read content on the server (to grade and tag), so content has to be in the prod image either way.
  - Consequence: PR 13 must add `COPY --from=build /app/content ./content` to the prod stage of `Dockerfile`. The standalone server runs with cwd `/app`, so `process.cwd()/content` works. This is not on the `docs/PLAN.md` checklist yet; task C adds it.
- **Mutation transport:** route handlers (`POST /api/attempts`, `POST /api/lessons/complete`), not Server Actions.
  - Reason: Server Action IDs change on every build, so requests a service worker queued before a deploy could not be replayed. A plain URL plus JSON body can be stored in IndexedDB and replayed as-is, which `docs/ARCHITECTURE.md` §3.2 already expects.
- **Grading happens on the server.** The client sends only `exerciseId` and `answer`. The server finds the exercise in content and works out `day`, `skill`, `exercise_type`, `tags`, `correct` and `score` with the same pure functions the client uses for instant feedback. Reason: a short contract the client cannot get wrong, and replays stay correct.
- **Audio fallback:** an `AudioSource` interface. For now it is backed by the browser's `speechSynthesis` (en-US or en-GB from the profile accent, speeds 0.75 and 1). If no English voice is available, the exercise shows a "แสดงข้อความ" (show text) button and a "ข้าม" (skip) button.
  - Reason: minimal pairs and dictation can't be done without sound, and the TTS PR then only adds a file-backed source that falls back to speech.
- **Speaking types (`repeat_after_me`, `shadowing`, `speak_answer`):** show the text (and the sample answer for `speak_answer`). The learner taps a self-rating, "พูดได้" (I could say it) or "ยังไม่คล่อง" (not fluent yet).
  - Saved as `answer = {kind: "self", rating, recordingId?}`, with `correct = rating === "ok"` and `score = null`. The recording PR fills in `recordingId`.
- **`free_write`:** passes when the word count reaches `minWords`; `score = null` until AI grading in M2.
- **`phoneme_intro`:** a "ถัดไป" (next) button only, no attempt row, so seeing an example does not inflate accuracy.
- **Player state:** one `useReducer` with a pure reducer in `src/components/player/player-state.ts`, no state library. It holds the flat list of steps, the current step, results by exercise id, `sessionId` (made once per play) and the time each exercise started. Resuming mid-lesson is deferred to the offline PR.
- **Progress and streak updates:** on the server only.
  - Each `POST /api/attempts` runs in one transaction: insert attempts, ignoring ids already saved, and set `progress` to `in_progress` with `started_at` (never moving it back from `done`).
  - `POST /api/lessons/complete` runs in one transaction: set `progress` to `done` (keep the first `completed_at`, recompute `score`), update `streaks` via the pure `nextStreak`, set `profiles.current_day = max(current_day, day+1)` capped at 365.
  - The SRS PR later adds "put the lesson's words into `srs_cards`" to that same transaction.

## 2. Shared contract (task 0, merge first)

- **Branch:** `feat/m1-player-contract`
- **Owner:** backend-dev
- **Size:** M
- **Tests:** unit only. It touches no shared config files.

Files and signatures:

`src/lib/answers/normalize.ts`
```ts
export function normalizeAnswer(s: string): string; // lower-case; ’ ‘ → '; remove . ! ? , everywhere (replace with space); collapse/trim whitespace
export function matchesAny(input: string, accepted: readonly string[]): boolean;
```

`src/lib/answers/grade.ts` (pure; imports only types from `src/lib/content/schema.ts`)
```ts
export type Grade = { correct: boolean; score: number | null };
export const UNGRADED_TYPES = ["phoneme_intro"] as const;            // no attempt row
export const SUPPORTED_TYPES: readonly ExerciseType[];               // all 13 types in days 1–7
export function gradeExercise(ex: Exercise, answer: AttemptAnswer): Grade | { error: "kind_mismatch" | "unsupported" };
export function correctAnswerText(ex: Exercise): string | null;      // what the feedback bar shows after a wrong answer
export function countWords(s: string): number;
```

How each type is graded:
- `listen_choose`: `{kind: "choice", selected}`, score 1 or 0.
- `read_passage` and `minimal_pair`: `{kind: "choices", selected: number[]}` or `{kind: "pairs", selected: ("a"|"b")[]}`. Score is the fraction right; `correct` means all right.
- `dictation`: `{kind: "text"}` checked against `accept` plus `audioText`.
- `translate_th_en`: `{kind: "text"}` checked against `accept`.
- `arrange_words`: `{kind: "text"}` (the tiles joined), compared with `answer`.
- `fill_blank`: `{kind: "texts"}`, each blank checked against its own `answer[i]`; score is the fraction right.
- `vocab_match`: `{kind: "match", pairs: Record<vocabId, vocabId>}`; score is the fraction right.
- Speaking types: `{kind: "self"}`.
- `free_write`: `{kind: "text"}`, word count.

`src/lib/attempts/derive.ts` (pure)
```ts
export function findExercise(lesson: Lesson, exerciseId: string): { section: Section; exercise: Exercise } | undefined;
export function attemptSkill(section: Section, ex: Exercise): Skill; // "vocabulary" if type ∈ {vocab_match, spell_word} or the id segment is "vocab", else section.skill
export function deriveTags(lesson: Lesson, ex: Exercise, section: Section, vocabWords: ReadonlyMap<string, string>): string[]; // sorted, no duplicates
export function exerciseEnglishText(ex: Exercise): string[];       // every English text field of the exercise
```

`deriveTags` rules:
1. If the section skill is `pronunciation`, or the type is `minimal_pair` or `phoneme_intro`, add `phoneme:<p>` for every `phoneme_intro.phoneme` in the lesson.
2. Add `vocab:<id>` for every `vocabId` the exercise names.
3. Add `vocab:<id>` for each id in `lesson.vocab` whose `word`, as a whole word sequence ignoring case, appears in `exerciseEnglishText(ex)`.

`src/lib/attempts/contract.ts` (Zod; also imported by the client, so it must not import `src/db`)
```ts
export const ATTEMPT_SOURCES = ["lesson","drill","retest","checkpoint"] as const; // a type test asserts it equals AttemptSource in src/db/schema.ts
export const API = { attempts: "/api/attempts", completeLesson: "/api/lessons/complete" } as const;
export const attemptAnswerSchema: z.ZodDiscriminatedUnion<…>;  // kinds: choice | choices | pairs | text | texts | match | self{rating:"ok"|"unsure", recordingId?: uuid}
export const attemptInputSchema = z.strictObject({ id: z.uuid(), exerciseId, sessionId: z.uuid(), source: z.enum(ATTEMPT_SOURCES).default("lesson"),
  answer: attemptAnswerSchema, durationMs: z.number().int().min(0).max(3_600_000).optional(), createdAt: z.iso.datetime() });
export const postAttemptsRequestSchema = z.strictObject({ attempts: z.array(attemptInputSchema).min(1).max(50) });
export type PostAttemptsResponse = { results: Array<{ id: string; status: "created" | "duplicate" } & Partial<Grade>
                                              | { id: string; status: "rejected"; reason: "unknown_exercise" | "kind_mismatch" | "unsupported" }> };
export const completeLessonRequestSchema = z.strictObject({ day: z.number().int().min(1).max(365), sessionId: z.uuid(), completedAt: z.iso.datetime() });
export type CompleteLessonResponse = { progress: { day: number; status: "done"; score: number | null; completedAt: string };
                                       streak: { current: number; longest: number }; currentDay: number };
export function newId(): string; // crypto.randomUUID, falls back to getRandomValues (randomUUID does not exist over plain http)
```

How the server answers (the offline queue relies on this):
- 200 for a well-formed batch, with a status per item.
- The queue drops items marked `created`, `duplicate` or `rejected`, and retries only on a network error or a 5xx.
- 400 means the whole body is malformed.

`src/lib/offline/sink.ts`
```ts
export interface SyncSink {           // first-in first-out; completeLesson is sent only after every earlier attempt
  sendAttempt(a: AttemptInput): void; // never throws; keeps the item if sending fails
  completeLesson(c: CompleteLessonRequest): Promise<CompleteLessonResponse | { queued: true }>;
  pendingCount(): number; subscribe(cb: () => void): () => void;
}
```

`src/lib/audio/source.ts`
```ts
export type Accent = "us" | "uk";
export type PlayOptions = { rate?: 0.75 | 1; accent?: Accent; signal?: AbortSignal };
export class AudioUnavailableError extends Error {}
export interface AudioSource {
  readonly kind: "file" | "speech" | "none";
  canPlay(text: string): Promise<boolean>;
  play(text: string, opts?: PlayOptions): Promise<void>; // resolves when playback ends; rejects with AudioUnavailableError
  stop(): void;
}
```
The TTS PR adds `createFileAudioSource(manifest, fallback)`. The text-to-hash mapping stays inside it.

`src/components/exercises/types.ts`
```ts
export type VocabLookup = Record<string, { word: string; th: string; ipa: { us: string; uk: string } }>;
export type AnswerFor<T extends ExerciseType>; // maps each type to its answer kind
export type ExerciseProps<T extends ExerciseType> = { exercise: ExerciseOf<T>; vocab: VocabLookup;
  onAnswer(answer: AnswerFor<T>): void; result?: Grade; /* set after answering → lock inputs, highlight */ };
```
Each component owns its input and its own check button, and calls `onAnswer` once per exercise. It may show per-item feedback inside (e.g. each minimal pair). The player grades the answer and shows the feedback bar and the next button.

`src/lib/content/repo.ts` (server-only)
```ts
export function getLesson(day: number): Lesson | null;          // cached when NODE_ENV=production
export function getVocabLookup(ids: readonly string[]): VocabLookup; // must not use loadVocabBank: it re-validates every lesson and throws if any content file is bad
```
It reads only `content/vocab`, cached in prod.

Also in task 0: a short §5.1 "API contract" in `docs/ARCHITECTURE.md`. Task 0 is the only task that edits docs, apart from C.

Tests to write first (unit):
- `normalize`: case, extra spaces, `.` `!` `?` `,` in any position, curly apostrophe, empty input.
- `grade`: a table with one correct, one wrong and one wrong-kind case per type, using real exercises from `content/lessons/day-00{1..7}.json`. `dictation` without `accept` falls back to `audioText`.
- `derive`:
  - `d001-pron-02` gives skill `pronunciation` and tags `[phoneme:ae]`.
  - `d003-write-04` gives `vocabulary` and its six `vocab:` tags.
  - `d006` pronunciation exercises get no phoneme tag.
  - Implicit match: `d001-listen-02` gets `vocab:v-nice` and `vocab:v-meet`.
- `contract`: rejects a bad uuid, extra keys (for example a client-sent `correct`) and more than 50 items; type test that `ATTEMPT_SOURCES` matches the DB type; `newId` without `randomUUID`.

Done when: `make check` passes and nothing imports `node:fs` or `src/db` from the client-safe files.

## 3. Parallel tasks (after 0 merges)

**A. `feat/m1-attempts-api`**
- Owner: backend-dev. Size: L.
- Owns `src/app/api/**`, `src/lib/server/**`, `src/db/queries/**`, `src/lib/progress/**`.
  - `src/lib/server/current-user.ts`
  - `src/lib/server/attempts-handler.ts`: `handlePostAttempts(req, {db, userId, now})`
  - `src/lib/server/complete-handler.ts`
  - `src/db/queries/attempts.ts`: insert with `ON CONFLICT (id) DO NOTHING RETURNING id`, plus the `in_progress` upsert
  - `src/db/queries/progress.ts`: `completeLesson(tx, …)`, and `touchStreak(tx, userId, localDate)` so SRS can reuse it
  - `src/lib/progress/streak.ts`: `nextStreak(prev, date)`
  - `src/lib/progress/lesson-score.ts`: mean of the latest auto-graded attempt per exercise for that day
  - `src/lib/progress/local-date.ts`: `toLocalDate(iso, tz)`
  - `src/app/api/attempts/route.ts` and `src/app/api/lessons/complete/route.ts`: thin wrappers around `getDb()` and `getCurrentUserId()`
- Tests to write first:
  - Unit, `nextStreak`: same day unchanged, next day +1, gap resets to 1, an older date (late replay) unchanged, `longest` kept.
  - Unit, `toLocalDate`: `2026-11-25T18:30Z` in Asia/Bangkok is 2026-11-26.
  - Unit: `lessonScore`.
  - Integration (`*.int.test.ts`, calling the handlers directly against the test DB):
    - The same id twice gives one row and `duplicate`.
    - A batch with one unknown id gives 2 created and 1 rejected.
    - Columns `day`, `skill`, `exercise_type`, `tags`, `correct`, `score`, `answer`, `duration_ms`, `source` and `session_id` are filled from content.
    - `created_at` is the client time, capped at now + 5 min.
    - The first attempt sets `in_progress` and never downgrades `done`.
    - Two concurrent `ensureLocalUser` calls leave one user.
    - Completion: sets `done`, `completed_at`, `score`, streak 1 then 2 on the next local day, and advances `current_day`; a second completion changes nothing.
    - Malformed JSON gives 400.
- Done when: `make check` passes; `curl` against `make up` returns the documented shapes.

**B1. `feat/m1-lesson-player`**
- Owner: frontend-dev. Size: L.
- Owns `src/app/(learn)/**` (including `layout.tsx` with the `AudioProvider`), `src/components/player/**`, `src/components/audio/**`, `src/lib/audio/speech-source.ts`, `src/components/exercises/registry.ts`, and the exercise components that need sound: `PhonemeIntro.tsx`, `MinimalPair.tsx`, `ListenChoose.tsx`, `Dictation.tsx`, `RepeatAfterMe.tsx`, `Shadowing.tsx`, each with its test.
- Pieces:
  - `registry.ts` is a `Partial<Record<ExerciseType, Component>>`. A type with no component shows "ยังไม่รองรับ" (not supported yet) and a skip button, with no attempt saved.
  - The player takes `sink: SyncSink` and `audio: AudioSource` as props or context, so tests use fakes.
  - The page validates the day (1–365, else `notFound()`) and awaits the `params` Promise (Next 16).
- Tests to write first:
  - Unit, reducer: the next button is locked until answered (and open at once for `phoneme_intro`); results are recorded; an unsupported type is skipped; the end screen appears after the last step.
  - Unit: `speech-source` with a mocked `speechSynthesis` (language, speed, no voice leads to `AudioUnavailableError`).
  - Component, player with a fake sink and audio:
    - Answering `listen_choose` shows "ถูกต้อง" (correct) or the correct answer.
    - `sink.sendAttempt` receives a payload that passes `attemptInputSchema`, with the same `sessionId` all lesson long.
    - No attempt is sent for `phoneme_intro`.
    - The last step calls `completeLesson` and shows the streak, or "จะบันทึกเมื่อออนไลน์" (will save when online) when queued.
    - With no audio, "แสดงข้อความ" and "ข้าม" appear.
  - Component, each exercise: the Thai instruction renders; a correct and a wrong answer call `onAnswer` with the right kind.
- Done when: `make test-unit` and `make check` pass, and the layout works at 360px (Tailwind classes only, no `globals.css` edit).

**B2. `feat/m1-exercises-text`**
- Owner: frontend-dev (second agent). Size: M.
- Owns `src/components/exercises/{ReadPassage,ArrangeWords,TranslateThEn,SpeakAnswer,FillBlank,VocabMatch,FreeWrite}.tsx` with their tests, and `src/lib/offline/http-sink.ts` with its test.
- Tests to write first:
  - Component: each type's correct and wrong paths.
  - `arrange_words`: tap a tile to add it, tap again to remove; check is locked until every tile is used.
  - `fill_blank`: one input per `___`.
  - `vocab_match`: tap an English word, then its Thai meaning.
  - `free_write`: live word count; locked below `minWords`.
  - `speak_answer`: two self-rating buttons; the sample answer is shown after rating.
  - Unit, `http-sink` with a mocked `fetch`:
    - Sends to `API.attempts`, first in first out.
    - On 2xx, items marked `rejected` are dropped.
    - On 5xx or a network error, items are kept and `pendingCount` goes up.
    - `completeLesson` waits for earlier attempts and returns `{queued: true}` when offline.
- Done when: `make test-unit` and `make check` pass. B2 does not touch `registry.ts`.

**C. `feat/m1-player-wiring`**
- Owner: frontend-dev. Size: S.
- Depends on A, B1 and B2 being merged.
- Work:
  - Add B2's components to `registry.ts`.
  - Have the day page create `createHttpSink()`.
  - `src/app/page.tsx` and `src/app/page.test.tsx`: show `current_day` and the streak through a `getLearnerHome(db, userId)` query in `src/db/queries/home.ts`, which C adds.
  - `src/app/today/page.tsx` redirects to `/day/<currentDay>`.
  - Tick and annotate `docs/PLAN.md`, including the note for PR 13 to copy `content/`.
- Tests to write first:
  - Component: the home page with a stubbed query shows the link to today's day.
  - Integration: `getLearnerHome` on a fresh DB returns day 1 and streak 0.
- Done when: day 1 plays through by hand at 360px with `make up`, and the rows appear in `make db-studio`.

Who owns shared files:
- `package.json` and the lockfile: nobody. If a task finds it needs a package, it stops and asks.
- `src/db/schema.ts`, migrations, `src/app/layout.tsx`, `globals.css`, `next.config.ts`, `Makefile`, compose and `Dockerfile`: nobody touches them.
- `docs/`: task 0 and C only.
- `src/lib/content/{schema,loader}.ts`: unchanged.

E2E for later, at 360px:
- Play day 1 to the end with no horizontal scroll; reload and the home page shows streak 1 and day 2.
- A day with no `speechSynthesis` voice still completes using the text fallback.
- When the offline PR lands: go offline mid-lesson and back online, with no duplicate rows.

## 4. Exercise types

- **Day 1 needs 10 types:** `phoneme_intro`, `minimal_pair`, `repeat_after_me`, `listen_choose`, `dictation`, `shadowing`, `speak_answer`, `read_passage`, `arrange_words`, `translate_th_en`.
- **Also in this slice, for days 3–7:** `fill_blank`, `vocab_match` (days 3, 5, 6) and `free_write` (day 7). That makes all of week 1 playable for a small extra cost in B2.
- **Deferred:**
  - `roleplay`: needs the AI tutor (M2).
  - `use_in_sentence`: needs AI grading.
  - `spell_word`: needs reliable word audio, so it waits for the TTS PR.
  - None of the three appears in days 1–7. If one shows up, the registry fallback lets the learner skip it.

## 5. Risks and open questions

**Need your decision (product behaviour):**
1. **Speaking self-rating.** Should "พูดได้" count as `correct = true`? My default: yes, stored as `answer.kind = "self"` so the progress formulas can leave it out of speaking accuracy. The alternative is not saving speaking attempts until recording exists.
2. **Wrong answers.** My default: one try, show the right answer, move on (one attempt per exercise per play). Allowing retries would create several attempts per exercise.
3. **Future days.** My default: any day is open and `current_day` only moves forward. The alternative is locking days after `current_day`.
4. **Streak trigger.** My default: a completed lesson counts; SRS reviews can call `touchStreak` later.
5. **Normaliser additions.** Removing `.` `!` `?` `,` everywhere (not only at the end) and treating curly apostrophes as `'`. Without the apostrophe rule, iPhone typing "I’m" would be marked wrong.

**Engineering defaults I recommend:**
6. **Review days get no phoneme tag.** Days 6–7 have no `phoneme_intro`, so their pronunciation attempts get no `phoneme:` tag. Fix later with an optional `phonemes` field in content (schema, docs and content together).
7. **The prod image has no content.** Task 0 makes this a requirement for PR 13, so the API and day page do not fail in prod.
8. **Running Docker from worktrees.**
   - B1 and B2 only need `make test-unit` (`run --no-deps`, no port published), so a worktree works after one fresh `node_modules` install.
   - A needs Postgres. A second compose project in a worktree would clash on `127.0.0.1:5432` if the main checkout's Postgres is running, and integration tests share one test database (`docs/TESTING.md`).
   - So the orchestrator should run A's integration tests in the main checkout, or stop the main stack while A runs, and never run two `make test` at once.
9. **No auth until M2.** Anyone on the tailnet can write data. That is acceptable for a single user and goes away with Better Auth.
10. **AI grading of `free_write` (M2) needs a design choice.** Attempts are only ever added, never edited, so M2 must either add a new attempt (`source` unchanged) or a separate grading table. It does not affect this slice.
