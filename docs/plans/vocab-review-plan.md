# แผน: ทวนคำศัพท์ด้วย FSRS (roadmap "Vocabulary SRS (FSRS)", ภาพ 23–24)

สถานะ: แผนของ architect (2026-11-26) PR 1 ทำแล้ว (2026-11-27: ข้อ 1.11, 2.7, 4.4 แก้ตามของจริงที่ตรวจ/คำนวณ) PR 2 ทำแล้ว (ข้อ 4.5) PR 3 ทำแล้ว (ข้อ 4.7) PR 4–6 ยังไม่เริ่ม อ่านคู่กับ `docs/PROGRESS.md` §2/§5, `docs/ARCHITECTURE.md` §4/§5.1, `design/README.md` (ui-v2 "การตัดสินใจของผู้ใช้"), `docs/plans/replay-plan.md` (ใช้รูปแบบเดียวกัน)

เป้าหมาย: คำศัพท์ (`lesson.vocab`) ของบทที่เรียนจบแล้วกลายเป็นการ์ดทวน **2 ใบต่อคำ** (`en_th` และ `th_en`) ทุกวันผู้เรียนทวนการ์ดที่ถึงกำหนด แต่ละใบ: ด้านหน้า → เปิดดู → ด้านหลัง → ให้คะแนน 1–4 (ประเมินตัวเอง) → ตัวจัดตาราง (FSRS) กำหนดวันทวนครั้งถัดไป
- `en_th` (ภาพ 23–24): หน้า = คำอังกฤษ + IPA + ปุ่มฟัง, หลัง = คำแปลไทย + ประโยคตัวอย่าง
- `th_en` (กระจกของภาพ 23–24, ยังไม่มีภาพอนุมัติ): หน้า = คำแปลไทย, หลัง = คำอังกฤษ + IPA + ปุ่มฟัง + ประโยคตัวอย่าง (ข้อ 2.6)

## 0. สิ่งที่ผู้ใช้ตัดสินใจแล้ว (ห้ามเปิดใหม่)

| # | การตัดสินใจ | ที่มา |
|---|---|---|
| U1 | ปุ่มให้คะแนน 4 ปุ่ม จำไม่ได้ / ยาก / ได้ / ง่าย = FSRS rating 1–4 และแสดงระยะเวลาที่จะกลับมาทวนใต้ปุ่ม | `design/README.md:96`, ภาพ 24 |
| U2 | ทวนคำที่ถึงกำหนด **ครบ** นับสตรีค ตอบใบเดียวไม่นับ | `design/README.md:91`, `docs/PROGRESS.md:195` |
| U3 | ใช้เฉพาะคำของบทที่เรียนจบแล้ว ไม่เปิดคำล่วงหน้า | `design/README.md:90` |
| U4 | ทุกอย่างของแอปรันใน Docker, TDD, PR เล็กเรื่องเดียว, บังคับด้วยเครื่องก่อนข้อตกลง | `CLAUDE.md` |
| U5 | ข้อมูลที่เขียนจาก client ผ่านคิว offline ที่มี id จาก client กันบันทึกซ้ำ (ออฟไลน์เต็มรูปแบบทำทีหลัง) | `CLAUDE.md`, `docs/ARCHITECTURE.md:157-158` |
| U6 | วันที่ตามเขตเวลา `profiles.timezone` | `docs/PROGRESS.md:194` |
| U7 | หน้าจอตามภาพ 23 (ด้านหน้า: "ทวนคำศัพท์", "4 / 12", คำ, IPA, "ฟัง", "ฟังช้า 0.75×", "นึกความหมายให้ออกก่อน แล้วค่อยเปิดดู", ปุ่ม "ดูความหมาย") และภาพ 24 (ด้านหลัง: คำแปลไทย, ตัวอย่าง en/th, "จำได้แค่ไหน" + 4 ปุ่ม) | ผู้ใช้อนุมัติภาพ 23–24 |
| U8 | **สองทิศตั้งแต่แรก:** ทุกคำของบทที่จบมีการ์ด `en_th` และ `th_en` (ทั้งสองแบบประเมินตัวเอง ไม่พิมพ์) | ผู้ใช้ตอบ 2026-11-26 ("สองทิศตั้งแต่แรก") |
| U9 | คำของบทที่เพิ่งจบ ทวนครั้งแรก **วันถัดไป** (`en_th`) และ `th_en` ช้ากว่านั้นอีกหนึ่งวัน (ข้อ 2.1) | ผู้ใช้ยืนยันข้อแนะนำ 2026-11-26 |
| U10 | **ไม่จำกัด** การ์ดใหม่/การทวนต่อวัน (ผลที่รู้แล้ว: ข้อ 2.7) | ผู้ใช้ยืนยันข้อแนะนำ 2026-11-26 |

## 1. ข้อเท็จจริงจากโค้ดตอนนี้

1. ตาราง `srs_cards` มีครบทุกฟิลด์สถานะของการ์ดแบบ ts-fsrs รุ่น 5 (`due`, `stability`, `difficulty`, `scheduled_days`, `learning_steps`, `elapsed_days`, `reps`, `lapses`, `state` 0–3, `last_review`) PK `(user_id, vocab_id, direction)` และ index `(user_id, due)` (`src/db/schema.ts:126-156`) แต่ **ไม่มี `created_at`**
2. `srs_reviews` มี `id` uuid จาก client, `rating` CHECK 1..4, `reviewed_at`, `duration_ms`, `state_before`/`state_after` jsonb (`src/db/schema.ts:159-180`) แต่ **ไม่มี `session_id`** และ **ไม่มี FK ไปที่การ์ด** (รีวิวของคำที่ไม่มีการ์ดเขียนลงได้)
3. `activity_days.source` รับแค่ `lesson | practice` และมีคอมเมนต์ว่า "the SRS PR adds review" (`src/db/schema.ts:37`, `:218-226`) `touchStreak(db, userId, localDate, source)` ใช้ร่วมได้ทันที (`src/db/queries/progress.ts:24-30`)
4. ยังไม่มีโค้ดใดเขียน `srs_cards`/`srs_reviews` (grep) ไม่มี package `ts-fsrs` ใน `package.json` แม้ `docs/ARCHITECTURE.md:21` จะระบุไว้
5. สูตรคำศัพท์ (`src/lib/progress/vocab.ts:40-55`) อ่านจาก `srs_cards` + `srs_reviews` เท่านั้น ไม่อ่าน `attempts`: "กำลังเรียน" = มีการ์ดอย่างน้อยหนึ่งทิศ, "จำได้" = การ์ด `en_th` `stability` ≥ 7, **"รู้จริง" ต้องมีการ์ดทั้ง `en_th` และ `th_en`** (`docs/PROGRESS.md:48`) และ `retentionRate` อ่าน `state_before.state` จาก jsonb (`vocab.ts:112-132`, รูปแบบที่ `docs/PROGRESS.md:59` กำหนด)
6. รายการคำที่สอนแล้ว: `getTaughtWords(day)` คืนทุกคำใน `vocab` ของบทวันที่ 1..day (`src/lib/content/repo.ts:81-101`) และ `getVocabLookup(ids)` คืน word/th/ipa (`repo.ts:64-72`) ส่วน `examples` ยังไม่มีใน lookup
7. วันที่จบแล้วเรียงต่อกันเสมอ (บทล็อกตามลำดับ `current_day` = วันจบสูงสุด + 1, `docs/ARCHITECTURE.md` "การล็อกบทเรียน") แต่แผนนี้อ่าน `progress.status = 'done'` ตรงๆ (`listDoneDays`, `src/db/queries/practice.ts`) ไม่อนุมานจาก `current_day`
8. คิว offline: `SyncSink` มี `sendAttempt`, `completeLesson`, `completePractice` (`src/lib/offline/sink.ts:23-31`) `http-sink` จัด batch จาก attempt ที่ต่อกันที่หัวคิวและหยุดเมื่อเจอรายการชนิดอื่น (`src/lib/offline/http-sink.ts:184-188`) คิวยังอยู่ในหน่วยความจำ (`http-sink.ts:1-2`)
9. กลุ่ม `(main)` บังคับให้มีแค่ 4 หน้าเมนู (`src/app/(main)/layout.test.tsx:31-33`) หน้าเล่นอยู่ในกลุ่ม `(learn)` ที่ใส่ `SpeechAudioProvider` ตาม accent ของโปรไฟล์ (`src/app/(learn)/layout.tsx`) ปุ่มเสียง `PlayButtons` ("ฟัง" / "ฟังช้า 0.75×") และ `useExerciseAudio` ใช้ซ้ำได้ตรงตามภาพ 23 (`src/components/audio/AudioControls.tsx:19-68`)
10. attempts handler เรียงแถวตาม `id` ก่อนเขียนเพื่อกัน deadlock (`src/lib/server/attempts-handler.ts:73-75`) **ห้ามลอกมาใช้กับรีวิว** เพราะรีวิวของการ์ดเดียวกันต้องคำนวณตามลำดับเวลา (ข้อ 3.4)
11. **ts-fsrs 6.0.1 (ตรวจจากแพ็กเกจที่ติดตั้งจริงใน Docker 2026-11-27, ไม่ใช่จากหน้า npm):** ติดตั้งแบบ exact (`"ts-fsrs": "6.0.1"`) ผ่านนโยบาย supply-chain ของ lockfile ได้ licence MIT (`LICENSE`), ESM+CJS, `engines.node >= 24` (เรารัน Node 26.13.1 และ `package.json` เรา `>=26`), runtime dependency 1 ตัวคือ `@open-spaced-repetition/srs-kit` 1.0.1 (**BSD-3-Clause** ไม่ใช่ MIT, ไม่มี dependency ต่อ, 772 KB unpacked) ไม่มี dependency อื่น
    - **API:** `defineScheduler({ model, chrono }).use(...middlewares).create({ config })` และตัวสำเร็จรูป `await DefaultScheduler(options)` (**async** เพราะโหลดโมเดลแบบ lazy; ค่าเริ่มต้น `version` = FSRS-7) ตัว scheduler มี `newCard({now})`, `preview({card, now})` (iterable ของ `{grade, card, revlog}` สี่ค่า), `review({card, grade, now})` → `{card, revlog}` **ไม่แก้ card ที่ส่งเข้าไป** (ทดสอบกับ object ที่ `Object.freeze` แล้ว) ไม่มี `repeat`/`next` แบบรุ่น 5 ที่ใช้ได้โดยไม่ deprecated (`fsrs()`/`FSRS` ยังอยู่แต่ติด `@deprecated`)
    - **โมเดลที่เลือกได้:** FSRS-3, 4, 4.5, 5, 6, 7 (subpath `ts-fsrs/models/fsrs-N`) เราเลือก **FSRS-6** ตามเหตุผลข้อ 4.1 และสร้าง scheduler แบบ **sync** จาก `defineScheduler` + `FSRS6Model` + middleware ชุดเดียวกับ `DefaultScheduler` (ผลเทียบแล้วตรงกัน) เพราะปุ่มต้องคำนวณระหว่าง render
    - **ฟิลด์ `Card` รุ่น 6 เทียบกับ `srs_cards`:**
      | ts-fsrs 6 `Card` | `srs_cards` | หมายเหตุ |
      |---|---|---|
      | `dueAt: Date` | `due` | เปลี่ยนชื่อ |
      | `lastReviewAt: Date \| null` | `last_review` | เปลี่ยนชื่อ |
      | `stability`, `difficulty` (number) | `stability`, `difficulty` | เหมือนเดิม |
      | `state` 0–3 (`New/Learning/Review/Relearning`) | `state` | เหมือนเดิม |
      | `scheduledDays` | `scheduled_days` | เหมือนเดิม |
      | `learningStep` (ตัวเลขเดียว) | `learning_steps` | เปลี่ยนชื่อ (เอกพจน์) |
      | `reps`, `lapses` | `reps`, `lapses` | เหมือนเดิม |
      | **ไม่มี** (ถูกตัดออก) | `elapsed_days` | adapter คำนวณเอง = จำนวนวันเต็มตั้งแต่ `last_review` ถึงเวลารีวิว เก็บคอลัมน์ไว้ตามข้อ 3.1 |
      | `scheduleStatus` (`"new"/"learning"/"review"`), `cardId` | **ไม่มี** | `scheduleStatus` หาได้จาก `state` (Relearning รายงานเป็น `"learning"`), `cardId` adapter ใส่ค่าคงที่ ไม่เก็บ |
      สรุป: **map ได้ไม่สูญเสียข้อมูลสถานะความจำ** (ทุกฟิลด์ที่ FSRS ใช้คำนวณมีคอลัมน์รองรับ) ผลต่างมีแค่ชื่อ และ `elapsed_days` ที่ library เลิกให้ ไม่ต้องแก้ schema/migration
    - **ค่าเริ่มต้นจริงที่ต่างจากที่ README อธิบาย:** `DefaultScheduler` ใช้ FSRS-7, `fractionalDays` เปิดตาม FSRS-7, `allowModelOverride` เปิดสำหรับ FSRS-7, `clearStatsOnForget` true จึงระบุทุกค่าเองใน `SRS_CONFIG` (ข้อ 4.4)
    - **ขนาด bundle:** `format.ts` (ดึง scheduler + ts-fsrs + FSRS-6 + srs-kit) ผ่าน esbuild minify = 38 KB, **12.2 KB gzip** (ต่ำกว่าเกณฑ์ 50 KB gzip; วัดด้วย esbuild ไม่ใช่ `next build` ของจริง)

## 2. กติกาพฤติกรรม

### 2.1 การ์ดเกิดเมื่อไร
1. การ์ด = 1 แถว `srs_cards` ต่อ `(vocab_id, direction)` ทุกคำได้ **2 ใบ** ทิศ `REVIEW_DIRECTIONS = ["en_th", "th_en"]` (U8) การ์ดสองใบของคำเดียวกันเรียกว่า **คู่ (sibling)** แต่ละใบมีสถานะ FSRS ของตัวเอง (ตารางทวนแยกกัน) ทิศ `listen_spell`, `speak` อยู่นอกขอบเขต
2. **ชุดคำที่ควรมีการ์ด** = ทุก id ใน `lesson.vocab` ของวันที่ `progress.status = 'done'` ที่มีอยู่ในคลังคำ (`content/vocab/`) คำนวณด้วยฟังก์ชันเดียว `expectedCardVocabIds(doneDays, getLesson, vocabIndex)` (server, ล้วนเมื่อส่ง loader เข้าไป)
3. **สร้างการ์ดด้วย `reconcileCards(tx, userId, now, tz)` ตัวเดียว** (idempotent, `INSERT ... ON CONFLICT DO NOTHING`) เรียกจาก 2 ที่:
   - (ก) ใน transaction ของ `POST /api/lessons/complete` หลัง `finishProgress` (เฉพาะครั้งที่เปลี่ยนเป็น done, ไม่ใช่การจบซ้ำ) → การ์ดของบทนั้นเกิดพร้อมการจบบทแบบ atomic
   - (ข) ตอนโหลดคิวทวน (หน้า `/review`, หน้า `/practice`) → **backfill** บทที่จบก่อนฟีเจอร์นี้ (วันที่ 1–7 ตอนนี้มีคำรวม 36 คำ) และซ่อมเองถ้า content เพิ่มคำให้วันที่จบแล้ว ไม่ต้องมีสคริปต์หรือ migration ที่อ่าน content
4. `due` เริ่มต้นของการ์ดใหม่ (state 0 New) มาจากฟังก์ชันล้วนตัวเดียว `initialDues(origin, now, tz): Record<ReviewDirection, Date>` (`src/lib/srs/initial.ts`, client-safe) `Record` บังคับให้ทุกทิศมีกติกา ค่าคงที่ `SIBLING_STAGGER_DAYS = 1` ใน `src/lib/srs/config.ts` และ `L(d)` = `localMidnight(d, tz)`:
   | origin | `en_th` | `th_en` |
   |---|---|---|
   | จบบท (ก): `{ kind: "lesson", completedAt }` ให้ `D = localDate(completedAt, tz)` (`completedAt` ที่ server ใช้จริงหลังตัด) | `L(D + 1)` เที่ยงคืนเริ่มวันถัดไป (U9) | `L(D + 2)` |
   | backfill (ข): `{ kind: "backfill" }` ให้ `T = localDate(now, tz)` | `now` (ทวนได้ทันที) | `L(T + 1)` |
   - เหตุผล: วันที่เรียนบทคือการเจอคำครั้งแรก, `en_th` (จำความหมาย) ง่ายกว่าจึงมาก่อน, `th_en` (นึกคำ) เริ่มเมื่อผ่านการทวนแบบแรกมาแล้วหนึ่งวันและไม่ถูกเฉลยโดยคู่ของตัวเองใน session เดียวกัน (ข้อ 11a)
   - ถ้า reconcile พบว่าคำมีการ์ดแค่ทิศเดียว (ข้อมูลเสียบางส่วน) ใบที่ขาดใช้ค่าของ backfill สำหรับทิศนั้น (ไม่แตะใบที่มีอยู่)
   - เทสต์: ทั้งตารางนี้ที่ Asia/Bangkok และ `America/Los_Angeles` (ข้ามวัน DST), จบบท 23:59 และ 00:01 ท้องถิ่น
   - `created_at` = `now` ของ server (คอลัมน์ใหม่ ข้อ 3)
5. ไม่มีเพดานการ์ดใหม่หรือการทวนต่อวัน (U10): เพดานเดียวคือจำนวนคำต่อบท (≤ 12, `docs/VOCABULARY.md:31,99`) ผลที่รู้แล้วอยู่ในข้อ 2.7
6. คำที่ถูกลบออกจาก content หรือย้ายไปวันที่ยังไม่จบ: การ์ดและรีวิวเดิม **ไม่ถูกลบ** (ข้อมูลที่ย้อนกลับไม่ได้) แต่ไม่อยู่ในคิว ไม่นับในจำนวนที่ถึงกำหนด และ server ปฏิเสธรีวิวใหม่ (`not_taught` / `unknown_word`) ถ้าคำกลับมาภายหลัง การ์ดเดิมใช้ต่อพร้อมสถานะเดิม เนื้อหาของคำ (คำแปล, ตัวอย่าง) อ่านจาก content ปัจจุบันเสมอ (DB เก็บแค่ id)

### 2.2 "ถึงกำหนด" และเขตเวลา
7. `today` = `localDate(now, tz)`, `endOfToday` = `localMidnight(addDays(today, 1), tz)` (ฟังก์ชันมีอยู่แล้วใน `src/lib/progress/dates.ts`)
8. การ์ด **ถึงกำหนดวันนี้** เมื่อ `due < endOfToday` และคำนั้นอยู่ในชุดข้อ 2 ใช้นิยามเดียวทุกสถานะ (New/Learning/Review/Relearning) ทั้งการนับบนหน้า, คิว, และการตรวจที่ server เหตุผล: `due` เป็นเวลาแน่นอน (ทวน 20:00 ระยะ 1 วัน → ครบ 20:00 น. เวลาท้องถิ่นพรุ่งนี้) ถ้าใช้ `due <= now` ผู้เรียนที่ทวนตอนเช้าจะไม่เห็นคำของวันนั้น จึงใช้ขอบเที่ยงคืนท้องถิ่นแทน **การนับ "วัน" ของ FSRS ใช้วันปฏิทินท้องถิ่น** (ไม่ใช่ UTC และไม่ใช่ทุก 24 ชม.): `ts-fsrs` นับวันเป็นผลต่างของวันที่ปฏิทิน UTC ซึ่งสำหรับ Asia/Bangkok จะเปลี่ยนวันเวลา 07:00 (พิสูจน์ด้วย library จริง 2026-11-27: การ์ด Review ที่ทวนล่าสุด 12:00 แล้วทวนอีกครั้ง 06:30 เช้าวันถัดไป library เห็นเป็น 0 วัน ส่วน 07:30 เห็นเป็น 1 วัน) adapter จึงแปลงทุกเวลาเป็น "เวลานาฬิกาท้องถิ่นที่เขียนเป็น UTC" ก่อนเข้า library และแปลง `due` กลับ: ระยะเป็นนาที (ขั้นเรียน) = ระยะเวลาจริงเท่าเดิม, ระยะ ≥ 1 วัน = เวลานาฬิกาท้องถิ่นเดิมของวันที่ครบ (ข้าม DST ได้ เช่น 12:00 ยังเป็น 12:00) ดังนั้นการ์ดที่ทวนก่อนกำหนดไม่กี่ชั่วโมงในวันปฏิทินเดียวกับ `due` ถือว่าครบกำหนดตรงวัน และ `elapsed_days` ที่เก็บ = ผลต่างวันที่ปฏิทินท้องถิ่นที่ FSRS ใช้จริง 
   - **ข้อยกเว้น session เดียวกัน (2026-11-27, รีวิวหลัง PR 1):** ถ้านับตามวันปฏิทินล้วน การ์ด Learning/Relearning ที่ตอบ 23:55 แล้วตอบอีกครั้ง 10 นาทีต่อมาที่ 00:05 จะถูกนับเป็น "ผ่านไป 1 วัน" FSRS จึงใช้สูตรระยะยาวและการ์ดใหม่จะจบขั้นเรียนที่ ~7 วันแทน ~2 วัน adapter (`step()` ตัวเดียวใน `scheduler.ts`) จึงใช้กติกา: ถ้าการ์ดอยู่ใน state Learning (1) หรือ Relearning (3) **และ** เวลาจริงตั้งแต่ `last_review` น้อยกว่า `SAME_SESSION_MAX_MS` (`config.ts` = 4 ชั่วโมง, ขอบบนไม่รวม) ให้นับ `elapsed_days = 0` ทั้งในการคำนวณของ FSRS และค่าที่เก็บ ไม่ว่าวันที่ปฏิทินจะต่างกันหรือไม่ การ์ด Review และช่วงที่นานกว่า 4 ชั่วโมงยังนับวันปฏิทินท้องถิ่นตามเดิม (Learning ที่ตอบเช้าวันถัดไป = 1 วัน) พิสูจน์ด้วยเทสต์: 23:55 → 00:05 ได้ stability/difficulty/state/interval เท่ากับ 12:00 → 12:10 ทุกประการที่ Asia/Bangkok, America/Los_Angeles (คืนก่อนเปลี่ยน DST) และ UTC; golden vectors มีเพิ่ม 2 ชุด (ของเดิม 14 ชุดไม่เปลี่ยนค่าใดเลย); oracle ตรวจ Learning/Relearning ที่ห่าง ≥ 1 วันด้วยสูตรระยะยาว
9. นิยามนี้เป็นฟังก์ชันล้วน `isDueToday(due: Date, now: Date, tz: string)` ใน `src/lib/srs/queue.ts` ใช้ทั้งสองฝั่ง ข้ามเที่ยงคืนระหว่างทวน: คิวของ session ยึด `today` ตอนเริ่ม (ข้อ 2.4)

### 2.3 ลำดับและการวนซ้ำใน session
10. คิวตอนเริ่ม = การ์ดถึงกำหนดวันนี้ (ทั้งสองทิศ) เรียงด้วยฟังก์ชันล้วน `orderQueue(cards, teachOrder)` ผลคงที่ (ไม่สุ่ม):
    1. **ทวนก่อน ใหม่ทีหลัง:** กลุ่ม A = Review/Relearning/Learning (state 1–3) ตาม `due` เก่าสุดก่อน แล้วกลุ่ม B = New (state 0) **ทิศก่อน แล้วตามลำดับการสอน**: `en_th` ทุกใบตามลำดับการสอน (วัน, ตำแหน่งใน `lesson.vocab`) แล้ว `th_en` ทุกใบตามลำดับเดียวกัน (การตัดสินใจ orchestrator 2026-11-27 ดูข้อ 4.6: คู่ของคำเดียวกันห่างกันทั้งทิศโดยโครงสร้าง ไม่ใช่รอให้ `separateSiblings` แก้ทีหลัง) เท่ากันเรียงตาม `vocab_id` แล้ว `direction` ตามลำดับใน `REVIEW_DIRECTIONS` เหตุผล: ถ้าผู้เรียนหยุดกลางทาง การทวนที่กันลืมทำไปแล้ว ส่วนคำใหม่รอได้ (ยังถึงกำหนดอยู่) ไม่สลับกลุ่มกัน (interleave) เพราะง่ายกว่าและกลุ่ม B ส่วนใหญ่เป็นทิศ `en_th` ของคำใหม่อยู่แล้ว
    2. **แยกคู่ (ข้อ 11a)** ทำหลังเรียง เป็นขั้นสุดท้ายของ `orderQueue`
11. หลังให้คะแนน client คำนวณสถานะใหม่ด้วยตัวจัดตารางตัวเดียวกับ server (ข้อ 4) ถ้า `due` ใหม่ยัง `< endOfToday` ของวันเริ่ม session → ใส่การ์ดกลับเข้าคิว **หลังการ์ดอื่นอย่างน้อย 3 ใบ** (`REQUEUE_GAP = 3`; ถ้าเหลือน้อยกว่า 3 ใบ ไปท้ายคิว) แล้วแสดงทันทีเมื่อถึงคิว (ไม่รอให้ครบ 10 นาทีจริง) กรณีนี้รวม "จำไม่ได้" (relearning 10 นาที) และขั้นเรียนของการ์ดใหม่ ทุกครั้งที่แสดงซ้ำคือรีวิวใหม่ 1 แถว ตำแหน่งที่ใส่กลับต้องผ่านกติกาแยกคู่ (11a) ด้วย
11a. **แยกคู่ใน session:** การ์ดสองใบของคำเดียวกันต้องห่างกันอย่างน้อย `SIBLING_GAP = 4` ตำแหน่ง (มีการ์ดอื่นคั่น ≥ 3 ใบ) ทั้งตอนเรียงครั้งแรกและตอนใส่กลับ วิธี (ล้วน, คงที่): เดินคิวจากหน้าไปหลัง ถ้าการ์ดตำแหน่ง i มีคู่อยู่ใน `SIBLING_GAP - 1` ตำแหน่งก่อนหน้า ให้เลื่อนการ์ดใบนั้นไปตำแหน่งแรกที่ห่างพอ (คงลำดับของการ์ดอื่น) ถ้าไม่มีตำแหน่งที่ห่างพอ (คิวสั้น) ให้ไปท้ายคิว ถ้ายังติดกับคู่ (คิวเหลือแค่คู่เดียวกัน) แสดงได้ (เลี่ยงไม่ได้โดยไม่แก้ `due`; เกิดได้เฉพาะเมื่อทั้งวันมีแต่สองใบนี้ถึงกำหนด) ข้อนี้เป็น invariant ที่ property test ตรวจ (แก้ถ้อยคำใน PR 1 เพราะข้อความเดิม "ถ้ามีการ์ดอื่นพอ ระยะ ≥ `SIBLING_GAP` เสมอ" เป็นจริงไม่ได้: คิวที่ท้ายเหลือ A1, A2 สองใบแยกกันไม่ได้) คือ "ผลเป็นการเรียงสับเปลี่ยนของคิวเดิม และคู่ใกล้กันได้เฉพาะเมื่อ**ทุกใบที่เหลือ**ตั้งแต่ตำแหน่งนั้นเป็นคู่ของการ์ด `SIBLING_GAP - 1` ใบก่อนหน้า (เลี่ยงไม่ได้)" วิธีทำ: ที่แต่ละตำแหน่งเลือกใบแรกที่เหลือซึ่งคู่ไม่อยู่ใน 3 ตำแหน่งก่อนหน้า ถ้าไม่มี (ทุกใบที่เหลือชนกัน) เลือกใบที่คู่ของมันอยู่ไกลถอยหลังที่สุด (เท่ากันเลือกใบแรก; แก้ 2026-11-27 จากเดิมที่เลือกใบแรกเสมอ)
    - การเลื่อนวัน `th_en` ของคำใหม่ (ข้อ 4) ทำให้คู่ถึงกำหนดวันเดียวกันได้น้อยตั้งแต่ต้น หลังจากนั้นตารางของสองใบแยกกัน การชนวันเดียวกันเกิดได้ และใช้ข้อ 11a แก้
12. ตัวนับ "x / n" ด้านบน: n = จำนวน **การ์ด** ที่ถึงกำหนดตอนเริ่ม (ทั้งสองทิศ) x = การ์ดที่ผ่านแล้ว (ไม่อยู่ในคิวอีก) + 1 การ์ดที่วนกลับมาไม่เพิ่ม n แถบความคืบหน้า = ผ่านแล้ว / n
13. ไม่มีปุ่มย้อนกลับ (undo) ในงานนี้ (**ต้องให้ผู้ใช้ยืนยัน ข้อ 7.4**) รีวิวถูกส่งเข้าคิวทันทีที่กดปุ่ม และ `srs_reviews` เป็น append-only

### 2.4 จบ session และสตรีค
14. session จบเมื่อคิวว่าง client ส่ง `completeReview({ sessionId, startedAt, completedAt })` ผ่านคิว (หลังรีวิวทั้งหมดของ session ตาม FIFO)
15. **วันที่ของ session** = `localDate(clamp(startedAt), tz)` (ไม่ใช่ `completedAt`) เพื่อให้ session ที่เริ่ม 23:50 แล้วจบ 00:10 นับเป็นวันที่เริ่ม ตรงกับคิวที่ client สร้าง
16. server นับสตรีค (`touchStreak(tx, userId, sessionDate, "review")`) เมื่อครบทั้งสามข้อ:
    - (ก) session นี้มี `srs_reviews` ที่เก็บแล้ว ≥ 1 แถว (ตอบใบเดียวแล้วออก = คิวไม่ว่าง จึงตก (ข) อยู่แล้ว ข้อนี้กันกรณีไม่มีการ์ดเลย)
    - (ข) ไม่มีการ์ด (ในชุดข้อ 2, **ทุกทิศใน `REVIEW_DIRECTIONS`**) ที่ `due < endOf(sessionDate)` และ `created_at <= startedAt` (การ์ดของบทที่จบหลังเริ่ม session ไม่นับ) กล่าวคือ "ทวนครบ" = ทุกการ์ดทั้งสองทิศที่ถึงกำหนดวันนั้นตอนเริ่ม session
    - (ค) ตรวจหลังรีวิวทั้งหมดของ session ถูกบันทึกแล้ว (คิว FIFO รับประกัน) รีวิวที่มาทีหลังทำได้แค่เลื่อน `due` ออกไป ผลจึงไม่กลับจาก true เป็น false
17. วันที่ไม่มีการ์ดถึงกำหนดเลย: ไม่มีปุ่มเริ่ม ไม่มี session จึงไม่นับสตรีค (**ต้องให้ผู้ใช้ยืนยัน ข้อ 7.5** แนะนำ: ไม่นับ ไม่งั้นสตรีคได้ฟรี)
18. ส่งจบซ้ำ (body เดิม): ผลเดิม `activity_days` PK กันซ้ำ ไม่มีตาราง session ใหม่ ถ้า (ข) ไม่ผ่าน ตอบ 200 `countedForStreak: false` พร้อม `remainingDue` (ไม่ใช่ 409 เพราะ client ที่ถูกต้องเจอได้ เช่น อีกแท็บเพิ่งจบบทใหม่)
19. หน้าจบ: h1 "ทวนครบแล้ว", "ทวน N คำ" + จำนวนต่อปุ่ม (จำไม่ได้ / ยาก / ได้ / ง่าย นับจากการกดใน session), สตรีค (`done`: "สตรีค X วัน (นานที่สุด Y วัน)"; `queued`: "จะบันทึกเมื่อออนไลน์"; `countedForStreak: false`: "ยังมีคำถึงกำหนดอีก K คำ" + ปุ่ม "ทวนต่อ"), ปุ่ม "กลับไปหน้าฝึกเพิ่ม" → `/practice` และ "กลับหน้าแรก" → `/`

### 2.5 ซ้ำ, ออฟไลน์, รีโหลด
20. รีวิวเดียวกันส่งซ้ำ (คิว retry, สองแท็บ, timeout แล้วสำเร็จ): `srs_reviews.id` (uuid จาก client) เป็นตัวกันซ้ำ แถวที่สองได้ `duplicate` พร้อม `stateAfter` ที่เก็บไว้ การ์ด **ไม่ถูกคำนวณซ้ำ**
21. ออฟไลน์ระหว่างทวน: client คำนวณสถานะต่อเองจากตัวจัดตารางเดียวกัน คิวเก็บรีวิวไว้ส่งทีหลังตามลำดับ server คำนวณซ้ำจากสถานะที่เก็บไว้ (server เป็นผู้ตัดสิน) ผลตรงกับ client เมื่อเริ่มจากสถานะเดียวกัน การเปิด `/review` ขณะออฟไลน์ยังไม่ได้ (รอ service worker เหมือนบทเรียน)
22. รีโหลดกลาง session: โหลดคิวใหม่จาก server (รีวิวที่ส่งแล้วมีผลแล้ว) ได้ `sessionId` ใหม่ รีวิวที่ค้างในคิวหน่วยความจำหายเหมือนบทเรียน `UnsavedNote`/`beforeunload` เตือนเหมือนเดิม
23. นาฬิกา client: `reviewedAt` ตัดเข้า `[floor, now]` (`src/lib/server/clamp.ts`) แล้วยกขึ้นเป็นอย่างน้อย `card.last_review` (เวลาถอยหลังไม่ได้)

### 2.6 เสียงและการแสดงผล
24. หน้าตาของการ์ดมาจากตาราง `CARD_FACES: Record<ReviewDirection, CardFace>` (`src/components/review/faces.ts`) ที่เดียว component ชุดเดียว (`ReviewCard`, `RatingBar`) token เดียวกัน ไม่มี `if (direction === …)` กระจายในหน้า เพิ่มทิศโดยไม่เพิ่มหน้าตา = compile error:
    | | `en_th` (ภาพ 23–24) | `th_en` (กระจก, ยังไม่มีภาพ) |
    |---|---|---|
    | ป้ายทิศใต้หัว | "อังกฤษ → ไทย" | "ไทย → อังกฤษ" |
    | ด้านหน้า | คำ (`lang="en"`, ใหญ่), IPA ตาม `profiles.accent`, `PlayButtons` "ฟัง" / "ฟังช้า 0.75×" | `th` (ใหญ่) เท่านั้น **ไม่มี IPA ไม่มีปุ่มเสียง** (จะเฉลยคำตอบ) |
    | คำแนะนำใต้การ์ด | "นึกความหมายให้ออกก่อน แล้วค่อยเปิดดู" | "นึกคำภาษาอังกฤษให้ออกก่อน แล้วค่อยเปิดดู" |
    | ปุ่มเปิด | "ดูความหมาย" | "ดูคำศัพท์" |
    | ด้านหลัง (บน → ล่าง) | คำ + IPA, เส้นคั่น, `th` ใหญ่, `examples[0]` en (`lang="en"`) + th | `th`, เส้นคั่น, คำ (`lang="en"`, ใหญ่) + IPA + `PlayButtons`, `examples[0]` en + th |
    | แถบให้คะแนน | "จำได้แค่ไหน" + 4 ปุ่มเหมือนกันทั้งสองทิศ (ข้อ 25) | เหมือนกัน |
    - ทั้งสองทิศเป็นการนึกในใจแล้วประเมินตัวเอง ไม่มีช่องพิมพ์ (การพิมพ์คำ `th_en` อยู่นอกขอบเขต ข้อ 9)
    - เสียง: speechSynthesis ผ่าน `AudioSource` เดิม (เมื่อมีไฟล์ TTS แค่เปลี่ยน source) ไม่เล่นอัตโนมัติ ไม่มีเสียง → `NO_AUDIO_NOTE` และยังเปิดดูได้ตามปกติ `useExerciseAudio` ถูกเรียกเฉพาะเมื่อด้านที่แสดงมีปุ่มเสียง
25. แถบล่าง "จำได้แค่ไหน" 4 ปุ่ม แต่ละปุ่มมีชื่อไทย (`RATING_LABEL_TH`) และระยะใต้ชื่อจาก `previewRatings(card, now)` (ข้อ 4.3) โฟกัสย้ายไปปุ่ม "ได้" หลังเปิด ปุ่มสูง ≥ 44px ใช้ได้ที่ 360px
26. `/practice`: การ์ด "ทวนคำศัพท์" บนสุดตามภาพ 06: "ถึงกำหนด N ใบ" (N = **จำนวนการ์ด** ทั้งสองทิศ ไม่ใช่จำนวนคำ เพราะคำเดียวอาจถึงกำหนดสองใบ; ภาพ 06 เขียน "คำ" ดูข้อ 7.10) + ปุ่ม "เริ่ม" → `/review` (N = 0: "วันนี้ไม่มีคำถึงกำหนด" ไม่มีปุ่ม; ยังไม่มีการ์ดเลย: "ยังไม่มีคำให้ทวน เรียนบทแรกให้จบก่อน") **ไม่แสดง "ประมาณ 4 นาที"** (ยังไม่มีข้อมูลเวลา) แก้บรรทัดใต้หัวให้รวมกติกาสตรีคของการทวน N นี้คือ n ของตัวนับ "x / n" ตอนเริ่ม (นิยามเดียวกัน ฟังก์ชันเดียวกัน)
27. หน้าแรก: ช่องสถิติ "คำที่เรียนแล้ว N" ตามภาพ 01 N = จำนวน `vocab_id` ที่มีการ์ดอย่างน้อยหนึ่งใบ = สถานะ "กำลังเรียน" ขึ้นไป (`docs/PROGRESS.md:51`) = จำนวนคำของบทที่จบแล้ว (เพราะสองใบเกิดพร้อมกัน) และถ้าการ์ดถึงกำหนด > 0 แสดงลิงก์ "ทวนคำศัพท์ · ถึงกำหนด N ใบ" → `/review` (ภาพ 01 ไม่มีลิงก์นี้: ข้อ 7.6) สูตร "รู้จริง" (`vocab.ts:46-51`) ใช้ได้ตามที่เขียนแล้วเพราะมีทั้งสองทิศ แต่ **ยังไม่แสดงบนหน้าจอในงานนี้** (ต้องทวนหลายสัปดาห์ก่อน `stability` ถึง 21 วัน จึงเป็น 0 ไปอีกนาน; แสดงพร้อมหน้าพัฒนาการ)

### 2.7 ปริมาณงาน (ผลของ U8 + U10 ที่ผู้ใช้ควรเห็น)
(แก้ 2026-11-27: ลำดับการ์ดใหม่เปลี่ยนเป็นทิศก่อน ข้อ 4.6 ทำให้ลำดับการกดต่างไป ตัวเลขสภาวะคงที่และการหยุดเรียนขยับเล็กน้อย; ตัวเลขวันแรกของ backfill ไม่เปลี่ยน) ตัวเลขข้อ 28–31 **คำนวณด้วย `simulateLoad` (PR 1)** ซึ่งใช้ `applyRating`, `initialDues`, `orderQueue`, `requeue` ตัวจริง แทนที่การประมาณเดิม **สมมติฐาน:** ผู้เรียนทวนทุกใบที่ถึงกำหนดทุกวัน (12:00 UTC) กด 1 ครั้ง/10 วินาที เสร็จบทตอน 18:00 วันที่มีคำใหม่ ส่วนคำตอบสุ่มแบบ seed คงที่ (1): "จำไม่ได้" 10% ของการกดทุกครั้ง ที่เหลือ ยาก 15% / ได้ 65% / ง่าย 20% ส่วนความไวต่อสมมติฐาน (จำไม่ได้ 20%) อยู่ในวงเล็บ เทสต์ `simulate.test.ts` ตรึงตัวเลขเหล่านี้ไว้ ถ้า library หรือ `SRS_CONFIG` เปลี่ยน เทสต์ล้มและต้องแก้ตัวเลขในแผนตาม

28. **วันแรกหลังส่งงาน (backfill วันที่ 1–7, 36 คำ):** วันแรก 36 ใบ `en_th` ใหม่ = **84 ครั้งกด ≈ 14 นาที** (จำไม่ได้ 20%: 103 ครั้ง ≈ 17 นาที) วันถัดไป 42 ใบ (36 `th_en` ใหม่ + 6 `en_th` ที่ยังต้องทวน) = **104 ครั้งกด ≈ 17 นาที** (20%: 128 ≈ 21 นาที) วันที่ 3: 27 ใบ 29 ครั้งกด ≈ 5 นาที ไม่ใช่ 72 ใบในวันเดียว เพราะ `th_en` เลื่อนไปหนึ่งวัน (ข้อ 4)
29. **สภาวะคงที่ (วันที่ 60–90, 5 วัน/สัปดาห์มีคำใหม่):**
    | คำใหม่ต่อบท | ≈ คำ/วัน | ใบถึงกำหนด/วัน (ใหม่) | ครั้งกด/วัน | เวลา | วันที่หนักสุด | (จำไม่ได้ 20%: ครั้งกด, เวลา) |
    |---|---|---|---|---|---|---|
    | 5 | 3.6 | 37.6 (7.4) | **52.0** | **8.7 นาที** | 73 | 97.9, 16.3 นาที |
    | 8 (เฟส 1) | 5.7 | 61.4 (11.9) | **84.1** | **14.0 นาที** | 114 | 151.2, 25.2 นาที |
    | 11 (เฟส 2) | 7.9 | 82.8 (16.3) | **113.6** | **18.9 นาที** | 145 | 211.2, 35.2 นาที |
    ตัวเลขเดิมที่ประมาณไว้ (~50 ครั้งกด, 1.6 เท่า, 2 เท่า) ใกล้ของจริง (52.0 → 84.1 = 1.6 เท่า → 113.6 = 2.2 เท่า) ความไวต่ออัตราลืมสูง: ลืม 20% ทำให้งานเกือบ 2 เท่า
30. ตัวเลขข้อ 28–29 พิสูจน์ด้วยเครื่องแล้ว ไม่ใช่การประมาณ: `simulateLoad({ wordsPerLessonDay, days, againRate, newWordDaysPerWeek, backfillWords, offDays, seed, secondsPerPress, timeZone })` ใน `src/lib/srs/simulate.ts` (ล้วน ผลคงที่) และ `simulate.test.ts` ตรึงค่า (วิ่ง 90 วันใช้ ~0.5 วินาทีต่อรอบ เพราะคำนวณขอบเที่ยงคืนครั้งเดียวต่อวันด้วย `isDueBefore` ไม่ใช่ต่อการ์ด)
31. **หยุดเรียน 7 วัน (วันที่ 61–67, ไม่ทวนและไม่เรียน, 5 คำ/บท):** วันกลับมาถึงกำหนด **160 ใบ = 209 ครั้งกด ≈ 35 นาที** (วันปกติช่วงนั้น 42 ใบ / 57 ครั้ง) แล้ววันถัดไป 35 / 39 / 27 / 39 ครั้งกด (จำไม่ได้ 20%: 236 ใบ, 374 ครั้ง ≈ 62 นาที) **ตัวเลข "250+ ใบ" ในแผนเดิมสูงเกินจริง** (การ์ดที่ถึงกำหนดช่วงหยุดมีแค่ราว 7 วัน × ~25 ใบ ที่เหลือยังไม่ถึงกำหนด) ไม่มีเพดาน (U10) จึงกองสะสม ผลต่อสตรีค: ทวนไม่ครบ = ไม่นับจากการทวน แต่จบบทยังนับ วิธีเพิ่มเพดานภายหลังแบบถูก: ค่า `MAX_NEW_PER_DAY` / `MAX_REVIEWS_PER_SESSION` ใน `orderQueue` **และ** นิยาม "ครบ" ในข้อ 16(ข) ต้องอ่านเพดานเดียวกัน (ฟังก์ชัน `sessionTarget(cards, limits)` ใช้ร่วม client/server) ไม่งั้นสตรีคจากการทวนจะเป็นไปไม่ได้ในวันที่เกินเพดาน

## 3. ข้อมูล (migration 0004)

### 3.1 คอลัมน์ที่ต้องมี vs ที่มี
| ตาราง | ต้องมี | มีแล้ว | ทำ |
|---|---|---|---|
| `srs_cards` | สถานะ FSRS ครบ | ครบ (`schema.ts:132-142`) | คงไว้ทุกคอลัมน์ (เก็บ `elapsed_days` แม้ ts-fsrs เลิกใช้ เพื่อไม่ต้องลบคอลัมน์) |
| `srs_cards` | `created_at` (ข้อ 16ข, "คำใหม่วันนี้" ในอนาคต) | ไม่มี | **เพิ่ม** `created_at timestamptz NOT NULL DEFAULT now()` |
| `srs_cards` | ไม่ให้ `due` เป็นค่าแปลก | – | CHECK `stability >= 0`, `difficulty >= 0` (ค่าการ์ดใหม่เป็น 0) |
| `srs_reviews` | `session_id` (นับ ≥ 1 รีวิวของ session) | ไม่มี | **เพิ่ม** `session_id uuid` nullable + index `(user_id, session_id)` |
| `srs_reviews` | รีวิวต้องมีการ์ด | ไม่มี FK | **เพิ่ม** FK `(user_id, vocab_id, direction)` → `srs_cards` `ON DELETE CASCADE` (เครื่องกัน "รีวิวของคำที่ไม่มีการ์ด") |
| `srs_reviews` | กันซ้ำ | `id` PK (client) | ใช้ `ON CONFLICT (id) DO NOTHING` |
| `activity_days` | source ของการทวน | `lesson`, `practice` | **เพิ่ม** `review` ใน `ACTIVITY_SOURCES` (drop/add CHECK) |

**สองทิศไม่เปลี่ยน migration 0004:** `srs_cards.direction` และ `srs_reviews.direction` มี CHECK รับ `th_en` อยู่แล้ว (`schema.ts:34,154,178`) PK `(user_id, vocab_id, direction)` เก็บสองใบต่อคำได้ และ FK ใหม่ครอบ `direction` จึงผูกรีวิวกับการ์ดทิศที่ถูก ไม่ต้องมีตาราง/คอลัมน์ "คู่" (คู่ = `vocab_id` เดียวกัน)

ตารางยังว่าง (ไม่มีโค้ดเขียน) migration จึงไม่ทำลายข้อมูล ผู้ตรวจต้องอ่าน SQL ที่ generate ว่ามีแต่ `ADD COLUMN`/`ADD CONSTRAINT`/`DROP CONSTRAINT activity_days_source_valid`/`CREATE INDEX` ไม่มี `DROP TABLE`/`DROP COLUMN`

### 3.2 รีวิวกับ `attempts`
**รีวิวไม่ใช่ attempt และไม่เพิ่ม `ATTEMPT_SOURCES` / `SOURCE_ROLES`** เหตุผล:
- `attempts` บังคับ `exercise_id` รูปแบบ `dXXX-<skill>-NN`, `day`, `skill`, `exercise_type`, `correct` (`schema.ts:92-123`) รีวิวไม่มีค่าเหล่านี้ ต้องปลอมค่า
- สูตรคำศัพท์ (`vocab.ts`) อ่าน `srs_cards`/`srs_reviews` อยู่แล้ว (PROGRESS §2) ส่วนจุดอ่อนมุมคำศัพท์อ่าน tag `vocab:<id>` ของ attempt `lesson`/`checkpoint` เท่านั้น (`config.ts:27`) และ "คำที่ลืมบ่อย" มาจาก `srs_cards.lapses` (`oftenForgotten`, `vocab.ts:135-142`) จึงไม่มีสูตรใดต้องการรีวิวในรูป attempt
- ข้อที่ยังขาด (บันทึกไว้ ไม่ทำในงานนี้): "เวลาฝึกรวมต่อสัปดาห์" (`docs/PROGRESS.md:196`) อ่าน `attempts.duration_ms` ต้องรวม `srs_reviews.duration_ms` ด้วยเมื่อทำหน้าพัฒนาการ

### 3.3 รูปแบบ jsonb `state_before` / `state_after`
เป็น **รูปแบบของเราเอง** ไม่ใช่ object ของ library (ts-fsrs 6 อาจเปลี่ยนชื่อฟิลด์จากรุ่น 5) ตรงตาม `docs/PROGRESS.md:59`: `{ due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review }` (snake_case, เวลาเป็น ISO string, `state` เป็นตัวเลข 0–3) สร้างด้วย `toStoredState(card)` ใน adapter ตัวเดียว `state_before` ของการ์ดใหม่คือสถานะ New (ไม่ใช่ null) เพื่อให้ `retentionRate` อ่าน `state` ได้เสมอ

## 4. ตัวจัดตาราง (scheduler)

### 4.1 เทียบทางเลือก
| | (a) `ts-fsrs` | (b) เขียน FSRS-6 เองใน repo |
|---|---|---|
| ความถูกต้อง | implementation อ้างอิงขององค์กร open-spaced-repetition (ผู้คิด FSRS) รวมขั้นเรียน/ขั้นเรียนซ้ำ (learning steps) ซึ่งเป็นส่วนที่ผิดง่ายที่สุด | สูตรหลัก ~150 บรรทัด แต่ learning steps, การทวนก่อนกำหนด, การปัดวัน ต้องเขียนเองและหา test vector เองซึ่งส่วนใหญ่ก็มาจาก ts-fsrs/py-fsrs อยู่ดี |
| licence / ดูแล | MIT, ออกรุ่น 6.0.1 แล้ว มีรุ่น beta ต่อเนื่อง | ดูแลเอง |
| ความเสี่ยง | API เปลี่ยนแรงระหว่างรุ่นใหญ่ (5→6: `repeat/next` → `preview/review`, ค่าเริ่มต้นเปลี่ยนเป็น FSRS-7), ขนาด unpacked ~850 KB (ต้องวัดขนาด bundle ฝั่ง client), dependency เพิ่ม 1 ตัว | บั๊กที่ไม่มีใครเห็นทำให้ระยะทวนผิดไปเรื่อยๆ ซึ่งผู้เรียนมองไม่เห็น |
| เข้ากับ schema | `srs_cards` ออกแบบตาม ts-fsrs 5 (`schema.ts:140`); รุ่น 6 ต้องตรวจชื่อฟิลด์ | กำหนดเองได้ |
| pure/deterministic | `preview`/`review` รับ `now` และไม่แก้ card เดิม (README); fuzz ปิดได้ | ได้ถ้าเขียนดี |

**แนะนำ (a) `ts-fsrs` ผ่าน adapter ตัวเดียว** เพราะส่วนที่เสี่ยงที่สุดของ FSRS คือรายละเอียดขั้นเรียน ไม่ใช่สูตร และการเขียนเองไม่ได้ลดความเสี่ยงนั้น การผูก library อยู่หลัง `src/lib/srs/scheduler.ts` ไฟล์เดียว (ESLint บังคับ) + รูปแบบที่เก็บเป็นของเราเอง (ข้อ 3.3) + golden test ทำให้เปลี่ยนเป็น (b) ได้ทีหลังโดยใช้ golden test ชุดเดิมพิสูจน์

เงื่อนไขของ PR 1 (ตรวจก่อนเขียนโค้ด ใน Docker, ไม่ใช่ข้อสรุปจากความจำ):
1. `docker compose run --rm app pnpm add ts-fsrs@6.0.1 --save-exact` แล้วอ่าน `node_modules/ts-fsrs/dist/index.d.mts`: ชื่อฟิลด์ `Card`, ค่า enum `Rating`/`State`, ค่าเริ่มต้นของ config, รุ่นโมเดลที่เลือกได้ จดผลลงหัวข้อ 1.11 ของแผนนี้
2. ถ้า `Card` รุ่น 6 ไม่มีฟิลด์ที่ map กับ `srs_cards` ได้ หรือ `preview` ต้องการสิ่งอื่นนอกจาก `card`+`now` (เช่น state ภายใน) → หยุดแล้วรายงาน (ทางเลือก: pin รุ่น 5.x ล่าสุด หรือทำ (b))
3. ตั้งค่าแบบระบุทุกค่า ไม่พึ่งค่าเริ่มต้นของ library: **โมเดล FSRS-6** (พารามิเตอร์เริ่มต้นที่เผยแพร่แล้ว FSRS-7 ยังใหม่), `desiredRetention 0.9` (ตรงกับเป้า ~90% ใน `docs/PROGRESS.md:66`), `learningSteps ['1m','10m']`, `relearningSteps ['10m']` (ภาพ 24 "จำไม่ได้ 10 นาที"), `enableShortTerm true`, `enableFuzz false` (preview = ผลจริงเสมอ, golden test ง่าย), `maximumInterval 36500` อยู่ใน `SRS_CONFIG` ใน `src/lib/srs/config.ts` ที่เดียว
4. วัดขนาด: `next build` แล้วดูว่า chunk ของ `/review` เพิ่มเท่าไร ถ้าเกิน ~50 KB gzip ให้รายงาน

### 4.2 API ของ adapter (`src/lib/srs/scheduler.ts`, client-safe, ฟังก์ชันล้วน)
```ts
export const RATINGS = [1, 2, 3, 4] as const;            // 1 Again, 2 Hard, 3 Good, 4 Easy
export type Rating = (typeof RATINGS)[number];
export type CardState = {                                 // ชื่อตรงกับคอลัมน์ srs_cards (camelCase ของ Drizzle)
  due: Date; stability: number; difficulty: number; scheduledDays: number; learningSteps: number;
  elapsedDays: number; reps: number; lapses: number; state: 0 | 1 | 2 | 3; lastReview: Date | null;
};
export function newCardState(due: Date): CardState;
export function applyRating(card: CardState, rating: Rating, now: Date, timeZone: string): CardState;     // review 1 ครั้ง
export function previewRatings(card: CardState, now: Date, timeZone: string): Record<Rating, CardState>; // ไม่เขียนอะไร
export function toStoredState(card: CardState): StoredCardState;                         // jsonb ข้อ 3.3
```
- `previewRatings` ไม่เขียนอะไร และ `applyRating` กับ `previewRatings` ผ่านฟังก์ชันภายในตัวเดียวกัน (`step`) จึงเท่ากันโดยโครงสร้าง ไม่ใช่แค่เทสต์; `timeZone` คือ `profiles.timezone` ระยะใต้ปุ่ม = `formatInterval(next.due - now)` ใน `src/lib/srs/format.ts`: < 60 นาที → "N นาที", < 24 ชม. → "N ชั่วโมง", < 31 วัน → "N วัน", < 365 วัน → "N เดือน", ไม่งั้น "N ปี" (ปัดเป็นจำนวนเต็มใกล้สุด ขั้นต่ำ 1)
- `applyRating(card, r, now, tz)` **เท่ากับ** `previewRatings(card, now, tz)[r]` ทุกกรณี (โดยโครงสร้าง + เทสต์ในทุกเขตเวลา) ปุ่มจึงไม่โกหก ผู้เรียกทุกคน (server ตอนบันทึกรีวิว, client ตอนแสดงปุ่ม, `simulateLoad`) ต้องส่ง **เขตเวลาเดียวกัน** ของโปรไฟล์ ไม่งั้นผลของ client กับ server ต่างกัน
- `isDueToday` คำนวณขอบเที่ยงคืนใหม่ทุกครั้ง (เรียก `Intl` เป็นร้อยครั้ง) คิวและตัวโหลดคิวต้องใช้ `endOfToday(now, tz)` ครั้งเดียวแล้ว `isDueBefore(due, end)` ต่อการ์ด
- ไม่มีที่ใดใน `src/lib/srs/**` เรียก `Date.now()` หรือ `new Date()` ไม่มีอาร์กิวเมนต์ เวลาเข้ามาทางพารามิเตอร์เท่านั้น

### 4.3 การทดสอบความ deterministic
- **golden vectors** `src/lib/srs/scheduler.golden.test.ts`: นาฬิกาคงที่ (`2026-01-01T01:00:00Z`) ลำดับคะแนนหลายชุด (เช่น `[3,3,3,3]`, `[1,3,3]`, `[4,4]`, `[3,1,3,3]` ที่ทวนตรงเวลา `due` ทุกครั้ง และชุดที่ทวนก่อนกำหนด 8 ชั่วโมง) เก็บผลทุกขั้นเป็นค่าคงที่ในไฟล์ (`stability` ทศนิยม 4 ตำแหน่ง, `due` ISO, `state`) ค่ารอบแรกสร้างจาก library ที่ pin ไว้ (บันทึกคำสั่งที่ใช้สร้างไว้หัวไฟล์) อัปเกรด library แล้วระยะเปลี่ยน = เทสต์ล้มดังๆ
- **ตรวจกับแหล่งอ้างอิงภายนอก 1 ชุด:** คัดลอก test vector จากเทสต์ของ ts-fsrs ที่ commit ตรงกับรุ่นที่ pin (อ้าง URL + commit ในคอมเมนต์) เพื่อพิสูจน์ว่า adapter ส่งค่าเข้า library ถูก
- **pure:** เรียกซ้ำด้วย input เดิม (deep-frozen) ได้ผล `toEqual` เดิม และ input ไม่ถูกแก้; `previewRatings` ไม่เปลี่ยนสิ่งที่ `applyRating` คืนภายหลัง
- **ค่าที่ภาพ 24 สัญญา:** การ์ด Review ที่ `stability` ราว 3 วัน แสดง "จำไม่ได้ 10 นาที" (relearning step) เทสต์เฉพาะ "10 นาที" (ค่าอื่นแล้วแต่สถานะการ์ด)

### 4.4 สิ่งที่ PR 1 ทำจริงและต่างจากแผนเดิม (2026-11-27)
1. **ตั้งค่า (ข้อ 4.1.3) เป็นค่าจริงใน `src/lib/srs/config.ts`:** `algorithm "FSRS-6"`, `desiredRetention 0.9`, `enableShortTerm true`, `learningSteps ["1m","10m"]`, `relearningSteps ["10m"]`, `graduatingInterval 1`, `enableFuzz false`, `maximumInterval 36500`, `weights` = 21 ค่าเริ่มต้นของ FSRS-6 เขียนตรงๆ เทสต์ `scheduler.test.ts` ตรึงทั้ง `SRS_CONFIG` และค่าที่ library รันจริง (`effectiveLibraryConfig()`) และตรวจว่า weights ตรงกับ `FSRS6_DEFAULT_WEIGHTS` ของ library (อัปเกรดแล้วเปลี่ยน = ล้ม)
2. **สร้าง scheduler แบบ sync ไม่ใช้ `DefaultScheduler`** (async) ด้วย `defineScheduler` + `ts-fsrs/models/fsrs-6` + `ts-fsrs/middlewares` เทสต์เทียบผลกับ golden ที่สร้างจาก `DefaultScheduler({version:"FSRS-6", ...})` จริง
3. **`elapsedDays` คำนวณใน adapter** (library ไม่ให้แล้ว) `CardState` คงชื่อตามคอลัมน์ `srs_cards`; adapter แปลงชื่อ (`dueAt`, `lastReviewAt`, `learningStep`) ทั้งสองทาง และใส่ `cardId` ค่าคงที่กับ `scheduleStatus` ที่หาจาก `state`
4. **แหล่งอ้างอิงภายนอก (ข้อ 4.3):** แพ็กเกจไม่มีไฟล์เทสต์ของ ts-fsrs และไม่ได้ดึงจาก GitHub จึงใช้ 2 ชั้นแทน: (ก) golden vectors ที่ `scripts/srs-golden.mjs` สร้างจาก library โดยตรง (ไม่ผ่าน adapter) 14 ลำดับ (8 แบบ UTC และ 6 แบบเขตเวลา) รวมการทวนก่อนกำหนด 8 ชั่วโมงและการลืมใน state Review และ (ข) `scheduler.fsrs6-oracle.test.ts` คำนวณจากสูตร FSRS-6 ที่เผยแพร่ + ค่า weights เริ่มต้น (stability/difficulty รีวิวแรก, สเต็ปเรียน, stability/ช่วงวันของการ์ด Review ทั้ง 4 คะแนน) โดยไม่ใช้ library **ยังไม่ได้เทียบกับ test vector ของ ts-fsrs เอง** (ทำเพิ่มได้ภายหลังถ้าต้องการ)
5. **ปุ่มระยะ:** `ratingIntervalLabels(card, now, timeZone)` อยู่ใน `format.ts` (59.7 นาที → "1 ชั่วโมง" ปัดข้ามขอบ ไม่แสดง "60 นาที"; 345–364 วัน = "12 เดือน" ตามกติกาน้อยกว่า 365 วันเป็นเดือน, 365 วันขึ้นไป = ปี)
6. **ไฟล์เพิ่มเติมใน `queue.ts`:** `cardKey`, `endOfToday`, `separateSiblings` (ข้อ 11a, ใช้ทั้งใน `orderQueue` และ `requeue`), `sessionCounter(total, queue)`; `requeue` เป็น generic; `orderQueue(cards, teachOrder: ReadonlyMap<vocabId, ตำแหน่งในหลักสูตร>)`
7. **contract:** `ParsedBatch<T>` ของรีวิวมีรูป `{ ok: true; id; value }` (ของ attempts ใช้ `attempt`); `getState()` ของ http-sink เพิ่ม `pendingReviews` (ฟิลด์บังคับ จึงต้องแก้ fake ใน `DayPlayer*.test.tsx`, `UnsavedNote.test.tsx` และเพิ่ม stub `sendReview`/`completeReview` ในทุก fake sink)
8. **`client-safe.test.ts`:** กฎเดิมห้ามทั้ง `lib/progress/**` แต่ `queue.ts`/`initial.ts` ต้องใช้ `dates.ts` (→ `config` → `sources` → `types`) ซึ่งล้วนและไม่แตะ server จึงอนุญาตเฉพาะ 4 ไฟล์นี้ (ที่เหลือใน `lib/progress` ยังต้องห้าม มีเทสต์ของตัวตรวจ)
9. **ESLint:** `no-restricted-imports` ห้าม `ts-fsrs` นอก `scheduler.ts` (ยกเว้น `scheduler*.test.ts` และ `scripts/srs-golden.mjs`) และต้องใส่ซ้ำในบล็อก `practice-*` เดิมเพราะบล็อกนั้นแทนที่กฎทั่วไป; `no-restricted-syntax` ห้าม `Date.now` และ `new Date()` ไม่มีอาร์กิวเมนต์ใน `src/lib/srs/**` เทสต์ `eslint-rules.test.ts` รัน ESLint จริงกับโค้ดตัวอย่าง จึงทดแทนขั้น "ลองใส่แล้ว `make lint` ต้องล้ม" อัตโนมัติ
10. **ข้อ 6.1 "ลองเพิ่ม `speak` ใน `REVIEW_DIRECTIONS`":** ทดลองจริง typecheck ล้มที่ `DIRECTION_LABEL_TH`, `initialDues` (2 จุด) และ type test ของ contract
11. **เขตเวลา (รีวิวหลัง PR 1):** ดูข้อ 2.2 ข้อ 8 — `applyRating`/`previewRatings`/`ratingIntervalLabels` รับ `timeZone`; `zone.ts` มี `toLocalWall`/`fromLocalWall`/`offsetMs`; golden vectors มี 14 ลำดับ รวม Bangkok (06:30 และ 23:30 ท้องถิ่น), Los Angeles ข้าม DST (มีนาคม และ ตุลาคม–พฤศจิกายน), Auckland (UTC+13); oracle ใน `scheduler.fsrs6-oracle.test.ts` ตรวจสูตร FSRS-6 ที่ t ≠ S, การอัปเดต difficulty, สูตร short-term (w17–w19) และเพดานต่างๆ: ผลลัพธ์ของรีวิวระยะสั้นในวันเดียวกัน **Hard ก็ถูกจำกัดไม่ให้ต่ำกว่า S เดิม (G ≥ 2)** ไม่ใช่เฉพาะ Good/Easy ตามที่เขียนไว้ตอนแรก
12. **ESLint:** `eslint-rules.test.ts` เดินทุก config block ที่ตั้ง `no-restricted-imports` และต้องมี pattern `ts-fsrs` (flat config: block ท้ายแทนที่ค่าของ block ก่อนหน้า) glob ครอบ `.js/.jsx/.cjs/.mjs/.ts/.tsx/.mts/.cts`
13. **เรื่องที่ PR ถัดไปต้องทำ (บันทึกไว้ ยังไม่ทำ):**
    - **การ์ดกันพลาดจากรีวิว PR 1 (2026-11-27):**
      - PR 3: เทสต์ integration ว่า `state_after` ที่เก็บ **เท่ากับ** `applyRating(state_before, rating, clampedReviewedAt, profiles.timezone)` (`reviewedAt` หลังตัดและยกแล้ว) และ response คืนการ์ดใบนั้นเอง (`card` = `state_after`)
      - PR 4: client ใช้เขตเวลาจาก `ReviewQueue.timeZone` เท่านั้น **ห้าม** `Intl.DateTimeFormat().resolvedOptions().timeZone` ของเครื่อง (เพิ่มกฎ ESLint ห้ามเรียกนี้ในไฟล์หน้าทวนเมื่อไฟล์เหล่านั้นมีอยู่); เทสต์ว่า preview ที่คำนวณด้วยเขตเวลาของ server เท่ากับการ์ดที่ server คืน; และ client **แทนที่** การ์ดในเครื่องด้วยการ์ดของ server เมื่อได้ `created`/`duplicate`
    - PR 3: `fromStoredState(json)` (ตรงข้ามกับ `toStoredState`) พร้อมเทสต์ round-trip และบีบชนิดคอลัมน์ `state` ของ `srs_cards` จาก `number` เป็น `0 | 1 | 2 | 3` ตอนอ่านจาก DB (ตอนนี้ `schema.ts` ประกาศเป็น `smallint` ธรรมดา)
    - PR 4: `UnsavedNote` ต้องแสดงข้อความของบทเรียนก็ต่อเมื่อมี attempt ค้าง ถ้ามีแต่รีวิวค้าง (`pendingReviews > 0`, `pendingAttempts === 0`) ต้องใช้ถ้อยคำของการทวนคำศัพท์ (ตอนนี้ดู `pendingAttempts` อย่างเดียว)
    - PR 2: `separateSiblings` อาจเลื่อนการ์ดใหม่ขึ้นมาก่อนการ์ดทวน (ข้อ 11a อนุญาต เพราะเรียงใหม่เฉพาะเมื่อคู่ชนกัน) เพิ่มเทสต์ "คิวที่ถูกต้องอยู่แล้วต้องไม่เปลี่ยน" ที่ระดับ `loadReviewQueue`
    - เอกสาร: แพ็กเกจ `@open-spaced-repetition/srs-kit` เป็น BSD-3-Clause อยู่ใน `docs/THIRD_PARTY.md` แล้ว

### 4.5 สิ่งที่ PR 2 ทำจริงและต่างจากแผนเดิม (2026-11-27)
1. **migration 0004** (`0004_swift_hitman.sql`): `ADD COLUMN created_at ... DEFAULT now() NOT NULL`, `ADD COLUMN session_id uuid`, `ADD CONSTRAINT srs_reviews_card_fk` (FK ประกอบ `(user_id, vocab_id, direction)` → `srs_cards` ON DELETE CASCADE), `CREATE INDEX srs_reviews_user_id_session_id_idx`, drop/add `activity_days_source_valid` (เพิ่ม `review`) และ CHECK `stability >= 0`, `difficulty >= 0` (ข้อ 3.1) ไม่มี DROP TABLE/DROP COLUMN แถวเดิมของ `srs_cards` (ถ้ามี) ได้ `created_at` = เวลา migration ส่วน FK จะล้มดังๆ ถ้ามีรีวิวที่ไม่มีการ์ด (ไม่มีทางเกิดเพราะยังไม่มีโค้ดเขียนสองตารางนี้)
2. **`reconcileCards(db, userId, now, timeZone, { content?, completed? })`**: เพิ่มพารามิเตอร์ `completed: { day, completedAt }` เพื่อบอกว่าบทไหนเพิ่งจบใน transaction นี้ (คำของบทนั้นเริ่มด้วยกติกา `lesson`, คำอื่นทั้งหมดและทิศที่ขาดของคำที่มีบางทิศอยู่แล้วใช้กติกา `backfill`) และ `content` (ค่าเริ่มต้น = ไฟล์จริง) ให้เทสต์ใส่เนื้อหาปลอมได้ ไม่ได้เพิ่มฟังก์ชัน `getTaughtWords` ใหม่: ลำดับการสอนมาจาก `expectedCardVocabIds` (วัน แล้วตำแหน่งใน `lesson.vocab`) และ `getTaughtWords` เดิมมีเทสต์ลำดับเดียวกันเพิ่ม
3. **`loadReviewQueue(db, userId, now, content?)`** คืน `ReviewQueue` ตามสัญญา (ข้อ 5.1) IPA เลือกตาม `profiles.accent` ตัวอย่างคือ `examples[0]` ไม่คำนวณ preview ในนี้ (client คำนวณเอง)
4. **ESLint:** `srsCards`/`srsReviews` import เป็นค่าได้เฉพาะ `src/db/queries/srs.ts`, `schema.ts`, `client.ts`/`test-utils.ts` (namespace import ของ Drizzle) และ `*.int.test.ts` (ไฟล์เหล่านี้ยังถูกห้าม `ts-fsrs`) type import ได้ทุกที่ `queries/srs.ts` มีเฉพาะ `listCards` และ `insertMissingCards` ส่วน `lockCard`/`insertReview`/`updateCard`/`countSessionReviews`/`countDueAt` ของข้อ 5.4 เป็นงานของ PR 3
5. **ขอบของการแยกคู่ (พบตอนเขียนเทสต์ loader):** `separateSiblings` เป็น greedy จึงคิวที่มีคำละ 2 ใบอยู่ครบทั้ง 5 คำ (10 ใบถึงกำหนดวันเดียวกัน) ปลายคิวเหลือคู่เดียวกันติดกันได้ (ใบที่ 9–10) ทั้งที่การเรียงแบบอื่นแยกได้ ตรงกับถ้อยคำข้อ 11a ("เลี่ยงไม่ได้ตามวิธี greedy") ยอมรับในงานนี้ (R3b) ถ้าผู้ใช้เห็นว่าเป็นปัญหา เปลี่ยนเป็นอัลกอริทึมที่ดูล่วงหน้าใน `queue.ts`

### 4.6 การตัดสินใจเพิ่มเติม (orchestrator, 2026-11-27)
1. **ลำดับการ์ดใหม่ = ทิศก่อน แล้วลำดับการสอน** (ข้อ 2.3/10): เดิมเรียง `a_en, a_th, b_en, b_th, …` ทำให้วันที่ผู้เรียนพลาดหนึ่งวัน (ทั้งสองทิศของหลายคำถึงกำหนดพร้อมกัน) ปลายคิว 5 คำเหลือ `e_en, e_th` ติดกัน (ตามรอยแล้ว) ตอนนี้ `en_th` ทุกใบก่อน แล้ว `th_en` ทุกใบ ห่างกันเท่าจำนวนคำของวันนั้น (≥ `SIBLING_GAP` เมื่อมี ≥ 4 คำ) ตรงกับความต้องการของผู้ใช้ว่าสองใบของคำเดียวกันไม่ควรช่วยเฉลยกัน ทวนก่อนใหม่ทีหลังเหมือนเดิม

### 4.7 สิ่งที่ PR 3 ทำจริงและต่างจากแผนเดิม (2026-11-27)
1. **ไฟล์:** `src/lib/server/review-handler.ts` (`handlePostReviews`), `review-complete-handler.ts` (`handleCompleteReview`), `src/app/api/reviews/{route,complete/route}.ts`, `queries/srs.ts` เพิ่ม `lockCard`, `insertReview`, `findReviewStateAfter`, `updateCard`, `countSessionReviews`, `countDueAt`; `scheduler.ts` เพิ่ม `fromStoredState` (zod ตรวจรูปแบบ, โยน error ถ้าผิด); `cards.ts` เพิ่ม `snapshotContent`, `reconcileCards` คืน `expected` ด้วย; ESLint บล็อก `src/lib/server/review-*.ts`
2. **การ์ดไม่มีแต่คำถูกสอนแล้ว:** ไม่ตอบ "ไม่มีการ์ด" แต่ `reconcileCards` สร้างให้ก่อน (ตามข้อ 5.2) แล้วทวนตามปกติ; `invalid` ใช้กับกรณีการ์ดหายหลังล็อก (ไม่ควรเกิด) และ id ที่เป็นของผู้ใช้อื่น (ไม่มีเหตุผล `unknown_card` ในสัญญา จึงไม่เพิ่ม `contract.ts`)
3. **ทวนก่อนกำหนดรับได้** (ตามข้อ 2.2: scheduler รองรับ) ไม่ปฏิเสธ
4. **`reviewedAt`:** ตัดเข้า `[floor, now]` แล้วยกเป็นอย่างน้อย `last_review` ของการ์ด (ข้อ 2.5/23); ถ้า `last_review` เป็นอนาคตของนาฬิกา server (นาฬิกาถอย) ค่าจะเกิน `now` ได้ ยอมรับ (เวลาต้องไม่ถอยหลัง)
5. **`/complete`:** ไม่เรียก `reconcileCards` (ไม่เขียนตารางอื่นนอกจาก `activity_days`/`streaks`); คำนวณชุดคำจาก `listDoneDays` + `expectedCardVocabIds`; `created_at <= startedAt` ใช้ `startedAt` ที่ตัดแล้ว จึงการ์ดที่เพิ่งสร้างด้วยนาฬิกา server ที่เร็วกว่านาฬิกา client อาจไม่ถูกนับ (หลวมไม่เข้ม) ผู้ใช้คนเดียว ยอมรับ; `startedAt` ที่ย้อนหลังมากถูกตัดที่ floor (ไม่ต่ำกว่า `start_date`) แต่ยังนับสตรีคของวันนั้นได้ถ้ามีรีวิว ≥ 1 (วันแรกของโปรไฟล์มีกิจกรรมจากบทเรียนอยู่แล้วโดยทั่วไป)
6. **การทวนซ้ำของ `/complete`:** ผลเหมือนเดิมตราบที่ไม่มีการเปลี่ยนแปลงการ์ด ถ้ามีรีวิวอื่นทำให้การ์ดกลับมาถึงกำหนดวันเดียวกันหลังจากนับแล้ว การเรียกซ้ำจะตอบ `countedForStreak:false` แต่แถว `activity_days` ที่เขียนแล้วคงอยู่ (ไม่มีการลบสตรีคที่ได้แล้ว)
7. **ต้นทุนต่อ request:** `POST /api/reviews` เรียก `reconcileCards` ทุกครั้งเพื่อให้ตรวจ `not_taught` ได้และสร้างการ์ดที่ขาด (อ่านรายการวันที่จบ, การ์ดทั้งหมด และคลังคำ 1 ครั้งต่อ request; ไม่เขียนอะไรถ้าไม่มีการ์ดขาด) ยอมรับ
8. **ข้อ 4.4.13 ส่วนที่เหลือ:** `fromStoredState` + test round-trip ทำแล้ว; การบีบชนิดคอลัมน์ `state` เป็น `0|1|2|3` ทำไว้ใน PR 2 แล้ว (`schema.ts`); ส่วน PR 4 ยังเหลือ

## 5. สัญญาที่ใช้ร่วมกัน

### 5.1 ไฟล์ใหม่ `src/lib/srs/contract.ts` (client-safe)
```ts
export const API_SRS = { reviews: "/api/reviews", completeReview: "/api/reviews/complete" } as const;
export const REVIEW_DIRECTIONS = ["en_th", "th_en"] as const;  // type test: ⊂ SrsDirection (src/db/schema.ts)
export type ReviewDirection = (typeof REVIEW_DIRECTIONS)[number];
export const DIRECTION_LABEL_TH = { en_th: "อังกฤษ → ไทย", th_en: "ไทย → อังกฤษ" } as const satisfies Record<ReviewDirection, string>;
export const reviewInputSchema = z.strictObject({
  id: z.uuid(), sessionId: z.uuid(),
  vocabId: z.string().regex(VOCAB_ID_PATTERN),                  // export จาก src/lib/content/schema.ts
  direction: z.enum(REVIEW_DIRECTIONS),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  reviewedAt: isoTimestamp, durationMs: z.number().int().min(0).max(3_600_000).optional(),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export function parseReviewBatch(body: unknown): ParsedBatch<ReviewInput>;  // envelope { reviews: unknown[] } 1..50, ตรวจรายตัว
export type ReviewRejectedReason = "unknown_word" | "not_taught" | "invalid";
export type ReviewResult =
  | { id: string; status: "created" | "duplicate"; card: WireCardState }
  | { id: string | null; status: "rejected"; reason: ReviewRejectedReason };
export type PostReviewsResponse = { results: ReviewResult[] };

export const completeReviewRequestSchema = z.strictObject({ sessionId: z.uuid(), startedAt: isoTimestamp, completedAt: isoTimestamp });
export type CompleteReviewResponse = {
  sessionDate: string; reviewed: number; remainingDue: number;
  streak: { current: number; longest: number }; countedForStreak: boolean;
};

/** สิ่งที่หน้า /review ได้จาก server (props) และ GET ในอนาคตจะคืนรูปเดียวกัน */
export type ReviewQueue = {
  today: string; endOfToday: string; timeZone: string;
  cards: { vocabId: string; direction: ReviewDirection; state: WireCardState;
           word: string; ipa: string; th: string; example: { en: string; th: string } | null }[];
};
```
`WireCardState` = `CardState` ที่เวลาเป็น ISO string (แปลงด้วย `toWire`/`fromWire` ใน contract) `Rating` ใน zod ต้อง `expectTypeOf` เท่ากับ `Rating` ของ scheduler

**ทิศเป็น union ครบทุกที่:** ทุกที่ที่ขึ้นกับทิศใช้ `ReviewDirection` ไม่ใช่ `string` และใช้ `Record<ReviewDirection, …>` (`DIRECTION_LABEL_TH`, `CARD_FACES`, `initialDues`) หรือ `switch` + `assertNever` ห้ามใช้ `SrsDirection` (มี `listen_spell`/`speak` ที่ยังไม่มีหน้าตา) ในโค้ดของการทวน type test: `REVIEW_DIRECTIONS` ⊂ `SrsDirection` และ `ReviewDirection` ของ zod = ของ `ReviewQueue`

**ทำไมไม่มี GET endpoint สำหรับคิว:** หน้า `/review` เป็น server component อ่าน DB แล้วส่ง `ReviewQueue` เป็น props (แบบเดียวกับ `/day/N` ที่ส่งบทเรียน) preview คำนวณที่ client ตอนเปิดด้านหลังจาก `state` + เวลาปัจจุบัน (เวลาเลื่อนไปทุกนาที ค่าที่ server คำนวณตอนโหลดจะเก่า) ถ้าทำ service worker/โหลดล่วงหน้า ค่อยเพิ่ม `GET /api/reviews/queue` ที่คืน `ReviewQueue` เดิม client ไม่ต้องแก้

### 5.2 Endpoint
- `POST /api/reviews` (`runJsonRoute`, 415/413/400 เหมือนเดิม): ตรวจรายตัว (แบบ `parseAttemptBatch`) ต่อรายการ: schema → `unknown_word` (ไม่อยู่ในคลัง) → `not_taught` (ไม่อยู่ในชุดข้อ 2.1/2) → (การ์ดไม่มี: `reconcileCards` สร้างก่อน) → savepoint: `SELECT ... FOR UPDATE` การ์ด → `reviewedAt` ตัดและยก (ข้อ 23) → `applyRating` → `INSERT srs_reviews ... ON CONFLICT (id) DO NOTHING RETURNING` → ถ้า insert ได้: `UPDATE srs_cards` เป็นสถานะใหม่ (`updated_at = now()`) ไม่งั้น `duplicate` + `state_after` เดิม (ไม่แก้การ์ด) **ลำดับใน batch:** เรียงตาม `(vocab_id, direction)` (ลำดับล็อกคงที่) แล้วตามลำดับใน request ภายในการ์ดเดียวกัน (ลำดับเวลา) ห้ามเรียงตาม `id`
- `POST /api/reviews/complete`: ข้อ 14–18 ไม่เขียนตารางอื่นนอกจาก `activity_days`/`streaks` (ผ่าน `touchStreak`)

### 5.3 `SyncSink` (`src/lib/offline/sink.ts`)
```ts
sendReview(r: ReviewInput): void;                                             // กันซ้ำในคิวด้วย id
completeReview(c: CompleteReviewRequest): Promise<CompleteResult<CompleteReviewResponse>>;
```
`http-sink.ts`: `Entry` เพิ่ม `{ kind: "review"; item: ReviewInput }` batch เอาเฉพาะรายการชนิดเดียวกันที่ต่อกันที่หัวคิว (attempt กับ review ไม่ปนใน request เดียว) กติกา retry/413/drop เหมือน attempts ทุกอย่าง (แยกฟังก์ชัน `sendBatch(url, key, items)` ใช้ร่วม ไม่ copy) completion ใช้ `enqueueComplete` เดิม key = `${API_SRS.completeReview}|${sessionId}` ตัวตรวจ response `isReviewCompleteResponse` `getState().pendingAttempts` เปลี่ยนชื่อไม่ได้ (ใช้อยู่) จึงเพิ่ม `pendingReviews` fake sink ในเทสต์ของ player (`LessonPlayer*.test.tsx`) เพิ่ม stub ใน PR 1

### 5.4 Query และฟังก์ชันร่วม
- `src/db/queries/srs.ts` (ไฟล์เดียวที่ import `srsCards`/`srsReviews` เป็นค่า, ESLint บังคับ): `listCards(db, userId)`, `insertMissingCards(tx, userId, rows)`, `lockCard`, `insertReview`, `updateCard`, `countSessionReviews`, `countDueAt(tx, userId, end, createdUpTo, allowed: Set<string>)`
- `src/lib/srs/cards.ts` (server): `expectedCardVocabIds`, `reconcileCards`, `loadReviewQueue(db, userId, now)` (เรียก reconcile → อ่านการ์ด → กรองชุดข้อ 2 → `isDueToday` → `orderQueue` → เติมเนื้อหาจาก content) และ `getReviewSummary(db, userId, now)` → `{ due: number; withCard: number }` สำหรับหน้าแรก/ฝึกเพิ่ม
- `src/lib/srs/queue.ts` (client-safe, ล้วน): `isDueToday`, `orderQueue` (รวมแยกคู่ข้อ 11a), `requeue(queue, card, nextDue, endOfToday)` (เคารพ `REQUEUE_GAP` และ `SIBLING_GAP`), ตัวนับ x/n
- `src/lib/srs/initial.ts` (client-safe, ล้วน): `initialDues(origin, now, tz): Record<ReviewDirection, Date>` (ข้อ 2.1/4) `reconcileCards` เรียกฟังก์ชันนี้เท่านั้น ไม่คำนวณ `due` เอง
- `src/lib/srs/simulate.ts` (ล้วน): `simulateLoad` (ข้อ 30)
- `src/lib/content/repo.ts`: `getVocabCard(ids)` คืน word/ipa/th/`examples[0]` (หรือขยาย `getVocabLookup`)

### 5.5 ใครเป็นเจ้าของไฟล์ไหน
| PR | ไฟล์ |
|---|---|
| 1 สัญญา + scheduler (คนเดียว ทำก่อน) | `package.json`/`pnpm-lock.yaml` (ts-fsrs), `src/lib/srs/{config,scheduler,format,queue,initial,simulate,contract}.ts` (+tests, golden), `src/lib/content/schema.ts` (export `VOCAB_ID_PATTERN` เท่านั้น), `src/lib/offline/{sink,http-sink}.ts` (+test), fake sink ใน `src/components/player/*.test.tsx`, `src/lib/client-safe.test.ts` (เพิ่ม `lib/srs/*` ที่ client-safe), `eslint.config.mjs` (กฎข้อ 6.1–6.3), แผนนี้ (ข้อ 1.11) |
| 2 DB + การ์ด | `src/db/schema.ts`, `src/db/migrations/0004_*` + `meta/`, `src/db/schema.int.test.ts`, `src/db/queries/srs.ts` (+int), `src/lib/srs/cards.ts` (+int), `src/lib/content/repo.ts` (+test), `src/lib/server/complete-handler.ts` (+int: การ์ดเกิดตอนจบบท), `src/lib/progress/types.ts` (type test ทิศ/แหล่ง), `docs/ARCHITECTURE.md` §4 |
| 3 server รีวิว | `src/lib/server/review-handler.ts`, `review-complete-handler.ts` (ใหม่ +int), `src/app/api/reviews/route.ts`, `src/app/api/reviews/complete/route.ts`, `src/app/api/routes.test.ts`, `docs/ARCHITECTURE.md` §5.1, `docs/PROGRESS.md` §2/§5, ตาราง API ใน `docs/FEATURE_MAP.md` |
| 4 หน้า `/review` | `src/app/(learn)/review/page.tsx` (+test), `src/components/review/{faces.ts,ReviewSession,ReviewCard,RatingBar,ReviewDoneScreen}.tsx` (+tests), แถว `/review` ใน `FEATURE_MAP.md` |
| 5 ทางเข้า | `src/app/(main)/practice/page.tsx` (+test), `src/app/(main)/page.tsx` (+test), `src/db/queries/home.ts` หรือเรียก `getReviewSummary`, `src/app/(main)/layout.test.tsx` (mock), แถวหน้าแรก/ฝึกเพิ่มใน `FEATURE_MAP.md` |
| 6 E2E + ปิดงาน | `e2e/review.spec.ts`, `docs/FEATURE_MAP.md` (คอลัมน์เทสต์), `docs/PLAN.md`, `design/README.md`, `docs/CONTENT_SCHEMA.md:17` (ระบุว่า "เข้า SRS เมื่อจบบท 2 การ์ด en_th/th_en, ทวนครั้งแรกวันถัดไป / วันถัดไปอีกวัน") |

PR 2 (backend) กับ PR 4 (frontend, ใช้ fake sink + `ReviewQueue` ปลอม) ทำคู่ขนานได้หลัง PR 1 merge PR 3 ต่อจาก PR 2 (คนเดียวกัน) PR 5 ต้องมี PR 2 PR 6 ต้องมีทุกอย่าง

## 6. แผน PR

ทุก PR: เขียนเทสต์ที่ล้มก่อนแล้ว commit ก่อนโค้ด, ผ่าน `make check`, integration test รันใน Docker

### PR 1 `feat/srs-contract` — scheduler, สัญญา, คิว
- ขั้นแรก: ตรวจ ts-fsrs ตามข้อ 4.1 (1)–(2) แล้วจดผล
- เทสต์ก่อน: `scheduler.golden.test.ts` (ข้อ 4.3), `scheduler.test.ts` (pure, frozen input, `applyRating == previewRatings[r]` ทุก r และทุก state, "10 นาที"), `format.test.ts` (59 นาที, 60 นาที, 23 ชม., 1 วัน, 30 วัน, 31 วัน, 400 วัน), `queue.test.ts` (`isDueToday` ที่ 23:59/00:00 Asia/Bangkok และ UTC, `orderQueue` คงที่: ทวนก่อนใหม่, ใหม่ตามลำดับสอน `en_th` ก่อน `th_en`; `requeue` เว้น 3 ใบ/ท้ายคิว, n ไม่เพิ่ม; **แยกคู่:** คู่ที่เรียงแล้วจะติดกันถูกแยก ≥ `SIBLING_GAP`, "จำไม่ได้" ของ `en_th` แล้วใส่กลับไม่ติดกับ `th_en` ของคำเดียวกัน, คิวที่มีแต่คู่เดียว → แสดงได้ไม่ค้าง; **property test** (fast-check ไม่ใช่ dependency ตอนนี้ จึงใช้ตัวสุ่มที่มี seed คงที่ 1,000 คิว) ว่า invariant ข้อ 11a จริงทุกคิว), `initial.test.ts` (ตารางข้อ 2.1/4 ทั้งสอง origin, Asia/Bangkok และ America/Los_Angeles ช่วง DST, จบบท 23:59/00:01, `th_en` ห่าง `en_th` 1 วันปฏิทินพอดี), `simulate.test.ts` (ผลคงที่, snapshot ครั้งกด/วัน ข้อ 30), `contract.test.ts` (rating 0/5/"3" ถูกปฏิเสธ, direction `listen_spell`/`speak` ถูกปฏิเสธ, `th_en` รับ, ฟิลด์เกิน, batch 51 → 400, รายการเสียรายการเดียวไม่ล้มทั้ง batch), `http-sink.test.ts` (review batch แยกจาก attempt, FIFO กับ completeReview, กันซ้ำด้วย id, 5xx → retry, completion 409 → rejected)
- **ตรวจด้วยเครื่อง:**
  1. `RATINGS`/`Rating` + `RATING_LABEL_TH: Record<Rating, string>` (`satisfies`) และ `switch` ที่มี `assertNever` → ลืมปุ่มใด = compile error; type test `Rating` ของ zod = ของ scheduler = ค่าตัวเลขของ `Rating` ใน ts-fsrs
  2. ESLint: `ts-fsrs` import ได้เฉพาะ `src/lib/srs/scheduler.ts` (`no-restricted-imports` ทั้ง repo ยกเว้นไฟล์นั้น)
  3. ESLint: ใน `src/lib/srs/**` ห้าม `Date.now` และ `new Date()` ไม่มีอาร์กิวเมนต์ (`no-restricted-syntax`) ลองใส่แล้ว `make lint` ต้องล้ม
  4. `client-safe.test.ts` ครอบ `scheduler`, `queue`, `initial`, `format`, `contract`
  5. ทิศ: `DIRECTION_LABEL_TH` และ `initialDues` เป็น `Record<ReviewDirection, …>` (`satisfies`); type test `REVIEW_DIRECTIONS` ⊂ `SrsDirection` (ลองเพิ่ม `"speak"` ใน `REVIEW_DIRECTIONS` แล้ว `make typecheck` ต้องล้มที่ทุก Record)
- ตรวจกับแอปจริง: ไม่มีหน้าจอใหม่ `make check` ผ่าน, `/day/1` ยังเล่นได้ (sink เปลี่ยน)

### PR 2 `feat/srs-cards` — migration 0004, การ์ดเกิดจากบทที่จบ
- เทสต์ก่อน (int, Postgres จริง):
  - schema: insert review ที่ไม่มีการ์ด → 23503 (FK); `activity_days.source='review'` ได้, `'foo'` → 23514; `srs_cards.created_at` มีค่า default
  - `reconcileCards`: วันที่ 1 done → 10 การ์ด (5 คำ × `en_th`/`th_en`) state 0 (`v-hello`…`v-cat`) `due` ตาม `initialDues`; เรียกซ้ำไม่เพิ่ม ไม่แก้การ์ดที่ทวนแล้ว; มีแค่ `en_th` → เติม `th_en` ใบเดียวด้วยค่า backfill; วันที่ 2 `in_progress` → ไม่มีการ์ดของวันที่ 2 ทั้งสองทิศ (**guard U3**); คำใน `vocab` ที่ไม่อยู่ในคลัง → ข้าม; content ชุดทดสอบที่ลบคำออก → การ์ดเดิมยังอยู่แต่ `loadReviewQueue` ไม่คืน
  - `complete-handler.int.test.ts`: จบวันที่ 1 → `en_th` 5 ใบ `due` = เที่ยงคืนท้องถิ่นวันถัดไป, `th_en` 5 ใบ `due` = เที่ยงคืนของวันถัดไปอีกวัน (Asia/Bangkok และเขตอื่น); จบซ้ำ → ไม่มีการ์ดเพิ่ม/ไม่เปลี่ยน `due`; บทที่จบได้โดยไม่มีไฟล์ไม่เกิดขึ้น (409 เดิม)
  - backfill: วันที่ 1–7 done แต่ไม่มีการ์ด → `loadReviewQueue` สร้าง 72 ใบ (`en_th` 36 ใบ `due = now`, `th_en` 36 ใบ `due` = เที่ยงคืนพรุ่งนี้) และคิววันนี้มี 36 ใบ (`en_th` เท่านั้น)
  - `loadReviewQueue`: ลำดับข้อ 10 + แยกคู่ข้อ 11a (ตั้ง `due` ของคู่ให้ตรงวันเดียวกันด้วยมือแล้วดูว่าไม่ติดกัน), `isDueToday` ที่ขอบเที่ยงคืน, เติม word/ipa ตาม accent/th/example ทั้งสองทิศ
- ตรวจด้วยเครื่องเพิ่ม: `reconcileCards` ไม่มีโค้ดคำนวณ `due` เอง (เรียก `initialDues` เท่านั้น ตรวจด้วยเทสต์ที่ mock `initialDues` แล้วค่าที่บันทึกตรงกับ mock)
- ตรวจด้วยเครื่อง: FK รีวิว→การ์ด, type test `SrsDirectionLike` = `SrsDirection` และ `ActivitySource` มี `review`, ESLint: `srsCards`/`srsReviews` จาก `@/db/schema` import เป็นค่าได้เฉพาะ `src/db/queries/srs.ts` (+ เทสต์ schema)
- ตรวจกับแอปจริง: `make db-migrate` แล้ว `\d+ srs_cards` เห็น `created_at`, `\d+ srs_reviews` เห็น `session_id` + FK, `\d+ activity_days` เห็น `'review'`; จบวันที่ 1 ผ่านแอป แล้ว `select vocab_id, direction, state, due from srs_cards order by vocab_id, direction;` ได้ 10 แถว `state = 0` `en_th` `due` = 00:00 ของพรุ่งนี้ (เวลาไทย = `17:00:00+00` ของวันนี้) และ `th_en` `due` = 00:00 ของมะรืน (`17:00:00+00` ของพรุ่งนี้)

### PR 3 `feat/srs-review-api` — บันทึกรีวิวและจบ session
- เทสต์ก่อน (int):
  - `review-handler`: รีวิวการ์ด New ด้วย 3 → `created`, แถว `srs_reviews` มี `state_before.state = 0`, การ์ด `reps = 1`, `due` = ค่าเดียวกับ `applyRating` ฝั่ง client (เวลาเดียวกัน)
  - **guard ส่งซ้ำ:** id เดิมส่งสองครั้ง (ทีละครั้ง และพร้อมกันสองคำขอ) → 1 แถว, `reps` เพิ่ม 1 ครั้งเดียว, ครั้งที่สอง `duplicate` พร้อม `card` = ที่เก็บไว้
  - ลำดับ: batch `[r1 rating 1, r2 rating 3]` ของการ์ดเดียวกันที่ id ของ r2 น้อยกว่า → คำนวณ r1 ก่อน (ผลเท่ากับ `applyRating(applyRating(c,1,t1),3,t2)`)
  - `reviewedAt` ในอนาคต/ก่อน `last_review` → ถูกตัด/ยก; `not_taught` (คำของวันที่ยังไม่จบ), `unknown_word`, รายการเสียหนึ่งรายการไม่ล้ม batch
  - รีวิว `th_en` ของคำเดียวกันเปลี่ยนเฉพาะการ์ด `th_en` (การ์ด `en_th` ไม่เปลี่ยน) และรีวิวที่ `direction` ไม่ตรงกับการ์ดที่มี → FK กันไว้
  - `review-complete-handler`: ทวนครบทั้งสองทิศ → `activity_days(source='review')` วันของ `startedAt`, `countedForStreak:true`; ครบ `en_th` แต่ยังเหลือ `th_en` 1 ใบ → `false`, `remainingDue: 1`, ไม่มีแถว activity; session ไม่มีรีวิว → `false`; การ์ดที่ `created_at > startedAt` ไม่นับ; เริ่ม 23:50 จบ 00:10 → วันที่เริ่ม; เรียกซ้ำ → ผลเดิม; วันที่มี `lesson` อยู่แล้ว → ไม่มีแถวใหม่ source เดิมคงอยู่
  - **guard "รีวิวไม่แตะบทเรียน":** snapshot `progress`, `profiles`, `attempts` ก่อน/หลังรีวิว + complete → `toEqual`
  - `routes.test.ts`: สอง route ใหม่ใช้ `runJsonRoute`
- ตรวจด้วยเครื่อง: ESLint `src/lib/server/review-*.ts` ห้าม import ตัวเขียน progress (`finishProgress`, `advanceCurrentDay`, `lockProgress`) และ `@/db/queries/attempts` (แบบเดียวกับ `practice-*`, ทดสอบด้วยเทสต์ import แบบ `practice-imports.test.ts`)
- ตรวจกับแอปจริง (แถว API ด้านล่าง) + SQL: `select rating, state_before->>'state', state_after->>'due' from srs_reviews order by reviewed_at desc limit 3;`

### PR 4 `feat/srs-review-page` — หน้า `/review` (ภาพ 23–24 + กระจก `th_en`)
- เทสต์ก่อน (fake sink, `ReviewQueue` ปลอมที่มีทั้งสองทิศ, เวลา fake timers) ทุกข้อด้านล่างรันแบบ `it.each(REVIEW_DIRECTIONS)` เมื่อใช้ได้:
  - `en_th` ด้านหน้า: "ทวนคำศัพท์", "1 / 3", ป้าย "อังกฤษ → ไทย", คำ `lang="en"`, IPA, "ฟัง", "ฟังช้า 0.75×", "นึกความหมายให้ออกก่อน แล้วค่อยเปิดดู", ไม่มีคำแปลก่อนกด "ดูความหมาย"
  - `en_th` ด้านหลัง: คำแปลไทย, ตัวอย่าง en/th, "จำได้แค่ไหน", 4 ปุ่ม "จำไม่ได้"/"ยาก"/"ได้"/"ง่าย" แต่ละปุ่มมีระยะจาก `previewRatings` (การ์ด Review: "จำไม่ได้" ใต้ปุ่มคือ "10 นาที")
  - `th_en` ด้านหน้า: ป้าย "ไทย → อังกฤษ", คำแปลไทย, "นึกคำภาษาอังกฤษให้ออกก่อน แล้วค่อยเปิดดู", ปุ่ม "ดูคำศัพท์"; **ไม่มี** คำอังกฤษ, IPA, ปุ่ม "ฟัง" และไม่มี `lang="en"` ใดๆ ในการ์ด (guard: คำตอบไม่รั่วก่อนเปิด, ตรวจทั้ง text, `aria-label`, `title`) และ `AudioSource.canPlay`/`play` ไม่ถูกเรียกก่อนเปิด
  - `th_en` ด้านหลัง: คำอังกฤษ `lang="en"` + IPA + "ฟัง"/"ฟังช้า 0.75×", ตัวอย่าง en/th, 4 ปุ่มพร้อมระยะเหมือน `en_th`
  - กด "ได้" → `sendReview` 1 ครั้ง `{rating:3, direction:<ทิศของใบนั้น>, sessionId}` แล้วไปใบถัดไป; กด "จำไม่ได้" → ใบนั้นกลับมาหลัง 3 ใบ, ตัวนับ n ไม่เพิ่ม; คิวที่มีคู่ของคำเดียวกันไม่แสดงติดกัน (ทั้งตอนเริ่มและหลัง "จำไม่ได้"); คิวว่าง → `completeReview` ครั้งเดียว → หน้าจบข้อ 19 (`done`/`queued`/`countedForStreak:false`)
  - ตรวจด้วยเครื่อง: `CARD_FACES` เป็น `Record<ReviewDirection, CardFace>` และ `ReviewCard` ไม่มี `direction ===` (เทสต์อ่าน source แบบเดียวกับ `color-scan`) แสดงทุกอย่างจาก `CARD_FACES`
  - ไม่มีเสียง → ข้อความไม่มีเสียง และยังเปิดดูความหมายได้; คิวว่างตั้งแต่ต้น → "วันนี้ไม่มีคำถึงกำหนดทวน" + ลิงก์ "กลับไปหน้าฝึกเพิ่ม"; DB ล่ม → `DbErrorScreen retryHref="/review"`
  - ไม่มีเมนูหลัก (อยู่ใน `(learn)`), ปุ่มสูง ≥ 44px (`touch-targets` ครอบ), color scan
- ตรวจด้วยเครื่อง: label ปุ่มจาก `RATING_LABEL_TH` (Record), `sessionId` สร้างครั้งเดียวตอน mount (เทสต์ rerender)
- ตรวจกับแอปจริง: แถว `/review` ด้านล่าง

### PR 5 `feat/srs-entry-points` — หน้าฝึกเพิ่มและหน้าแรก
- เทสต์ก่อน: `/practice` การ์ด "ทวนคำศัพท์" สามสถานะ (ข้อ 26) อยู่เหนือ "เล่นบทที่เรียนแล้วซ้ำ"; หน้าแรกช่อง "คำที่เรียนแล้ว N" (+ ลิงก์ถึงกำหนดถ้าผู้ใช้ยืนยันข้อ 7.6); `getReviewSummary` int test (นับเฉพาะชุดข้อ 2, ขอบเที่ยงคืน); `layout.test.tsx` mock ใหม่ผ่าน
- ตรวจกับแอปจริง: แถวด้านล่าง

### PR 6 `test/srs-e2e` — E2E และปิดงาน
- `e2e/review.spec.ts` (360px): ตั้งค่าวันที่ 1 done ผ่าน API ใน `beforeAll` (helper `e2e/helpers/day1.ts`) → `/practice` เห็น "ถึงกำหนด 5 ใบ" (backfill: `en_th` วันนี้, `th_en` พรุ่งนี้) → "เริ่ม" → ด้านหน้า "1 / 5" ป้าย "อังกฤษ → ไทย" → "ดูความหมาย" → ปุ่มทั้ง 4 มีระยะ → กด "ง่าย" ทุกใบ → "ทวนครบแล้ว" + สตรีค → กลับ `/practice` เห็น "วันนี้ไม่มีคำถึงกำหนด"; ไม่มี scroll แนวนอน ใช้คำที่ไม่ต้องใช้เสียง (กดได้โดยไม่ฟัง) เลี่ยงปัญหา `docs/PLAN.md:73`
- การ์ด `th_en` ใน E2E: E2E เลื่อนนาฬิกาของ server ไม่ได้ และ `th_en` ถึงกำหนดพรุ่งนี้ จึง **ไม่ครอบด้วย E2E** ในงานนี้ ครอบด้วยเทสต์ component/page (PR 4) + int (PR 2–3) + ตรวจด้วยตาในเบราว์เซอร์ (แถว FEATURE_MAP ด้านล่าง: ตั้ง `due` ด้วย SQL ในฐานข้อมูล dev) ถ้าต้องการ E2E ภายหลัง: เพิ่ม env `EZH_FAKE_NOW` ที่อ่านเฉพาะ `NODE_ENV=test` ใน `route.ts`/server component (เป็นงานแยก)
- ภาพหน้าจอ `th_en` ทั้งด้านหน้า/หลัง สองธีม ที่ 360px แนบใน PR 4 และ PR 6 เพื่อให้ผู้ใช้ดู (ข้อ 7.9)
- เอกสาร: ติ๊ก `docs/PLAN.md:55` (และส่วน SRS ใน `:58-59`), `design/README.md:68` ย้าย 23–24 ไป "ทำแล้ว", `docs/CONTENT_SCHEMA.md:17`, `docs/ARCHITECTURE.md:54` (`review/` อยู่ใต้ `(learn)`)

### แถวสำหรับ `docs/FEATURE_MAP.md` (คัดลอกได้)
| หน้าจอ/API | ไปถึงอย่างไร | พิสูจน์ว่าทำงาน | เทสต์ |
|---|---|---|---|
| ทวนคำศัพท์ `/review` | แตะ "เริ่ม" ในการ์ด "ทวนคำศัพท์" ที่ `/practice` หรือเปิด `/review` (ต้องจบวันที่ 1 ก่อน) | ไม่มีเมนูหลัก; หัว "ทวนคำศัพท์" + "1 / N"; คำอังกฤษ `lang="en"` + IPA + "ฟัง" / "ฟังช้า 0.75×"; "นึกความหมายให้ออกก่อน แล้วค่อยเปิดดู"; "ดูความหมาย" → คำแปลไทย, ตัวอย่าง, "จำได้แค่ไหน" + 4 ปุ่ม จำไม่ได้/ยาก/ได้/ง่าย มีระยะใต้ปุ่ม; "จำไม่ได้" → ใบนั้นกลับมาภายหลังใน session; การ์ดสองใบของคำเดียวกันไม่แสดงติดกัน; **การ์ด `th_en`** (ในฐานข้อมูล dev: `update srs_cards set due = now() where direction = 'th_en'` แล้วเปิด `/review` ใหม่): ป้าย "ไทย → อังกฤษ", หน้าแสดงคำแปลไทยอย่างเดียว ไม่มีคำอังกฤษ/IPA/ปุ่มฟัง, "นึกคำภาษาอังกฤษให้ออกก่อน แล้วค่อยเปิดดู", "ดูคำศัพท์" → คำอังกฤษ + IPA + "ฟัง" + ตัวอย่าง + 4 ปุ่ม; ครบ → h1 "ทวนครบแล้ว" + "สตรีค X วัน"; ไม่มีคำถึงกำหนด: "วันนี้ไม่มีคำถึงกำหนดทวน"; DB: `select count(*) from srs_reviews` เพิ่มตามจำนวนครั้งที่กด, `select local_date, source from activity_days order by 1 desc limit 1` = วันนี้ (`review` ถ้าวันนี้ยังไม่มีกิจกรรมอื่น) | `src/components/review/*.test.tsx`, `src/app/(learn)/review/page.test.tsx`, `e2e/review.spec.ts` |
| การ์ดเกิดจากบทที่จบ | จบบทวันที่ N | `select vocab_id, direction, state, due from srs_cards order by 1, 2` มีทุกคำใน `vocab` ของวันที่ N คำละ 2 แถว (`en_th`, `th_en`), `state=0`, `en_th` `due` = 00:00 พรุ่งนี้ตามเขตเวลา, `th_en` `due` = 00:00 มะรืน; บทที่จบก่อนมีฟีเจอร์: เปิด `/practice` แล้วการ์ดเกิด (`en_th` `due` = ตอนนั้น, `th_en` = 00:00 พรุ่งนี้); วันที่ยังไม่จบไม่มีการ์ด | `complete-handler.int.test.ts`, `src/lib/srs/cards.int.test.ts` |
| ฝึกเพิ่ม: การ์ดทวนคำศัพท์ | `/practice` | การ์ดบนสุด "ทวนคำศัพท์" + "ถึงกำหนด N ใบ" (N = จำนวนการ์ดทั้งสองทิศ = `select count(*) from srs_cards where due < <เที่ยงคืนท้องถิ่นถัดไป>` เฉพาะคำของบทที่จบ) + "เริ่ม" → `/review`; N=0 "วันนี้ไม่มีคำถึงกำหนด" ไม่มีปุ่ม; ไม่มีการ์ดเลย "ยังไม่มีคำให้ทวน เรียนบทแรกให้จบก่อน" | `src/app/(main)/practice/page.test.tsx`, `e2e/review.spec.ts` |
| หน้าแรก: คำที่เรียนแล้ว | `/` | ช่อง "คำที่เรียนแล้ว N" (N = `select count(distinct vocab_id) from srs_cards` = คำของบทที่จบ ไม่ใช่จำนวนการ์ด) | `src/app/(main)/page.test.tsx` |
| `POST /api/reviews` | `{"reviews":[{"id":"<uuid>","sessionId":"<uuid>","vocabId":"v-hello","direction":"en_th","rating":3,"reviewedAt":"<ISO>"}]}` | `created` + `card` ใหม่ (`"direction":"th_en"` ใช้ได้เหมือนกัน เปลี่ยนเฉพาะการ์ดทิศนั้น); ส่งซ้ำ → `duplicate` + `card` เดิม และ `select reps from srs_cards where vocab_id='v-hello'` ไม่เพิ่ม; คำของวันที่ยังไม่จบ → `rejected` `not_taught`; rating 5 → `rejected` `invalid` | `review-handler.int.test.ts`, `routes.test.ts` |
| `POST /api/reviews/complete` | `{"sessionId":"<uuid>","startedAt":"<ISO>","completedAt":"<ISO>"}` | 200 `{sessionDate, reviewed, remainingDue, streak, countedForStreak}`; ยังเหลือคำ → `countedForStreak:false` + `remainingDue`; เรียกซ้ำผลเดิม; `progress`/`profiles` ไม่เปลี่ยน | `review-complete-handler.int.test.ts`, `routes.test.ts` |

ตัวอย่าง curl: `curl -s -XPOST localhost:3000/api/reviews -H 'content-type: application/json' -d '<body ข้างบน>'`

## 7. การตัดสินใจของผู้ใช้

### ผู้ใช้ตัดสินแล้ว (2026-11-26 และ 2026-11-27)
| # | เรื่อง | คำตอบ | อยู่ในกติกาข้อ |
|---|---|---|---|
| 7.1 | คำของบทที่เพิ่งจบ ทวนครั้งแรกเมื่อไร | **วันถัดไป** (`en_th`) และ `th_en` ช้ากว่าอีก 1 วัน (`SIBLING_STAGGER_DAYS`) | U9, 2.1/4 |
| 7.2 | เพดานการ์ดใหม่/การทวนต่อวัน | **ไม่จำกัด** ผลที่รู้แล้ว: วันแรกหลังส่งงาน 36 ใบใหม่ (`en_th`) วันถัดไปอีก 36 ใบ (`th_en`) + ที่กลับมา, หยุดเรียนแล้วกองสะสม วิธีเพิ่มเพดานภายหลังอยู่ในข้อ 31 | U10, 2.7 |
| 7.3 | ทิศของการ์ด | **สองทิศตั้งแต่แรก** (`en_th` + `th_en`) สูตร "รู้จริง" ใน `vocab.ts` ใช้ได้ตามที่เขียน | U8, 2.1/1, 2.6/24 |
| 7.12 | วันของแอปเริ่มเมื่อไร (เสนอ 04:00 หรือเที่ยงคืน) | **เที่ยงคืนท้องถิ่น** ใน `profiles.timezone` (ผู้ใช้ตอบ 2026-11-27) ขอบวันทุกแห่ง (`due < endOfToday`, วันของสตรีค, วันที่ของ session, การนับ `elapsed_days`) คือ 00:00 ท้องถิ่น ไม่มีค่าชดเชย | U6, 2.2 |

### ต้องให้ผู้ใช้ยืนยัน (ยังสมมติอยู่)
| # | สิ่งที่สมมติ | แนะนำ | เปลี่ยนภายหลังอย่างไร |
|---|---|---|---|
| 7.4 | ไม่มีปุ่มย้อนกลับ (undo) หลังกดคะแนน | ไม่มีในงานนี้ (ภาพไม่มี) | ภายหลัง: เก็บรีวิวล่าสุดไว้ใน client ~5 วินาทีก่อน `sendReview` (ไม่ต้องแก้ server) |
| 7.5 | วันที่ไม่มีคำถึงกำหนด ไม่นับสตรีคจากการทวน (ต้องเรียนบทหรือเล่นซ้ำแทน) | ไม่นับ | เงื่อนไข (ก) ข้อ 16 ใน `review-complete-handler.ts` |
| 7.6 | หน้าแรกเพิ่มช่อง "คำที่เรียนแล้ว N" (มีในภาพ 01) และลิงก์ "ทวนคำศัพท์ · ถึงกำหนด N ใบ" (ไม่มีในภาพ) | ช่องสถิติ: ทำ; ลิงก์: ทำ เพราะไม่มีเพดาน การทวนที่ไม่ทำจะกองสะสม | แก้เฉพาะ `src/app/(main)/page.tsx` |
| 7.7 | เริ่ม session ก่อนเที่ยงคืนแล้วจบหลังเที่ยงคืน นับเป็นวันที่เริ่ม | ตามนี้ | ข้อ 15 ฟิลด์ `startedAt` → `completedAt` |
| 7.8 | ไม่เล่นเสียงคำอัตโนมัติตอนเปิดการ์ด | ไม่อัตโนมัติ (นโยบาย autoplay ของเบราว์เซอร์ + ใช้ในที่สาธารณะ) | prop เดียวใน `ReviewCard` (หรือเป็นตั้งค่าเมื่อมีหน้าตั้งค่าเสียง) |
| 7.9 | หน้าตาการ์ด `th_en` (ข้อ 24): ไม่มีภาพอนุมัติ **ทำเป็นกระจกของภาพ 23–24 ที่อนุมัติแล้ว** (component และ token เดียวกัน, ป้าย "ไทย → อังกฤษ" / "อังกฤษ → ไทย" ใต้หัว, ด้านหน้าไม่มี IPA/เสียง, ปุ่ม "ดูคำศัพท์") **จะส่งภาพหน้าจอให้ผู้ใช้ดูหลังทำเสร็จ** (PR 4) | ตามนี้ | แก้เฉพาะ `CARD_FACES` ใน `src/components/review/faces.ts` |
| 7.10 | จำนวนบน `/practice`/หน้าแรกนับเป็น **การ์ด** และเขียนว่า "ถึงกำหนด N ใบ" (ภาพ 06 เขียน "N คำ") เพราะคำเดียวอาจถึงกำหนดสองใบ และตัวเลขต้องตรงกับ "x / n" ในหน้าทวน | "ใบ" | ข้อความในสองหน้า (ถ้าอยากได้ "คำ" ต้องนับ `distinct vocab_id` ซึ่งจะไม่ตรงกับ n) |
| 7.11 | ลำดับใน session: ทวนการ์ดเก่าก่อน แล้วจึงการ์ดใหม่ (ไม่สลับกัน) และการ์ดคู่ห่างกันอย่างน้อย 4 ตำแหน่ง | ตามนี้ | ค่าใน `src/lib/srs/config.ts` + `orderQueue` |

## 8. ความเสี่ยง
- **R1 ts-fsrs รุ่น 6 ต่างจากที่ schema ออกแบบไว้** (ข้อ 1.11): กันด้วยขั้นตรวจแรกของ PR 1, adapter ไฟล์เดียว, รูปแบบ jsonb ของเราเอง, golden test; ถ้าไม่เข้ากันจริง ถอยไป pin 5.x หรือทำ (b) โดยใช้ golden test ชุดเดิม
- **R2 client กับ server คำนวณต่างกัน** (คนละรุ่น bundle หลัง deploy, อีกแท็บทวนการ์ดเดียวกัน): server ตัดสินและคืน `card`; client แสดงตามค่าของตัวเองใน session นั้น ผลกระทบแค่ระยะใต้ปุ่มของใบที่วนกลับมา ยอมรับ
- **R3 ปริมาณ:** สองทิศ × ไม่มีเพดาน = งานต่อวันประมาณ 2 เท่าของทิศเดียว (ข้อ 2.7 คำนวณแล้ว: 52 ครั้งกด ≈ 9 นาที/วันที่ 5 คำ/บท, 84 ≈ 14 นาที เฟส 1, 114 ≈ 19 นาที เฟส 2) และหยุดหนึ่งสัปดาห์กอง ~160 ใบ ≈ 35 นาทีในวันกลับมา การ "ทวนครบ" จึงยาก ไม่กระทบสตรีคจากบทเรียน ตัวเลขจริงมาจาก `simulateLoad` ใน PR 1 ถ้าสูงเกินรับได้ เพิ่มเพดานตามข้อ 31
- **R3a คำแปลไทยกำกวมในทิศ `th_en`:** `th` หลายคำมีหลายความหมาย ("ดี, น่ายินดี" อาจนึกเป็น good แทน nice) ผู้เรียนประเมินตัวเองจึงไม่ผิดระบบ แต่การ์ดอาจถูกให้ "จำไม่ได้" เกินจริง ถ้าเกิดบ่อย แนวแก้: แสดงชนิดคำ (pos) หรือคำใบ้ไทยบนหน้า `th_en` (เพิ่มฟิลด์ใน content ต้องแก้ schema) ไม่ทำในงานนี้
- **R3b คู่ติดกันเลี่ยงไม่ได้:** เมื่อทั้งคิวเหลือแค่การ์ดสองใบของคำเดียวกัน (ข้อ 11a) ยอมรับ
- **R4 `reconcileCards` ใน server component (GET):** เขียน DB ระหว่างแสดงหน้า เป็น idempotent และผู้ใช้คนเดียว ยอมรับ; ถ้าภายหลังมี prefetch หลายครั้ง แค่ `ON CONFLICT DO NOTHING` ซ้ำ
- **R5 ขนาด bundle ของ `/review`** (library 850 KB unpacked): วัดแล้วใน PR 1 ด้วย esbuild = 12.2 KB gzip (ข้อ 1.11) วัดด้วย `next build` ตอน PR 4
- **R6 migration:** FK ใหม่บนตารางที่ยังว่าง ปลอดภัย แต่ต้องอ่าน SQL ก่อน merge
- **R8 เปลี่ยน `profiles.timezone` หลังมีการ์ดแล้ว:** ค่าที่เก็บ (`due`, `last_review` เป็นเวลาจริงแน่นอน) ไม่ผิด แต่ขอบ "ถึงกำหนดวันนี้" และวันของสตรีคเลื่อนตามส่วนต่างของเขตเวลา (การ์ดที่ครบ 23:00 อาจเปลี่ยนจาก "วันนี้" เป็น "พรุ่งนี้") ไม่มีค่าใดเก็บไว้เป็นค่าไม่ถูกต้อง
- **R9 DST ล่วงหน้าไกล:** `due` ที่ห่างหลายเดือนข้ามการเปลี่ยน DST คำนวณจากกฎเขตเวลาใน tzdata ของรุ่น Node ที่รัน ถ้ารัฐบาลเปลี่ยนกฎก่อนวันนั้น ค่าที่เก็บไว้จะคลาดเคลื่อนได้ไม่เกินความต่างของ offset (ปกติ 1 ชั่วโมง) ไม่ทำให้ข้อมูลเสีย
- **R10 "Hard ถูกจำกัด (G ≥ 2)" ใน oracle:** กติกาที่ว่า Hard ในรีวิว session เดียวกันไม่ลด stability เป็นสิ่งที่ library ทำ (ts-fsrs 6.0.1) oracle ยืนยันว่า adapter ตรงกับ library ไม่ใช่การยืนยันอิสระจากสเปก FSRS-6 ที่เผยแพร่ ถ้าสเปกต่างจากนี้ ผลคือระยะของการ์ดที่ตอบ Hard ในขั้นเรียนอาจต่างเล็กน้อย
- **R7 E2E ไม่นิ่ง** (`docs/PLAN.md:73`): ไม่พึ่งเสียงใน E2E ห้ามแก้ด้วย retry

## 9. ไม่ทำในงานนี้ (ขอบเขต)
- ทิศ `listen_spell`, `speak` และ **`th_en` แบบพิมพ์คำ** (งานนี้ `th_en` นึกในใจแล้วประเมินตัวเอง; การพิมพ์ต้องมีการตรวจคำตอบ, การจับคู่ rating กับความถูก และหน้าตาใหม่ ทำภายหลัง)
- แสดง "คำที่รู้จริง"/ความคืบหน้า Oxford 3000/ระดับ CEFR บนหน้าจอ (สูตรพร้อมแล้ว ทำพร้อมหน้าพัฒนาการ)
- E2E ของการ์ด `th_en` (ต้องเลื่อนนาฬิกา server, ข้อ PR 6)
- ไฟล์เสียง TTS (ใช้ `speechSynthesis` ผ่าน `AudioSource` เดิม), อัดเสียง
- หน้า Word Bank `/words`, หน้ารายละเอียดคำ, tap-to-lookup เพิ่มคำเข้า SRS
- บทพัฒนาจุดอ่อนมุมคำศัพท์, ชุดฝึก 10 ข้อ, การ์ด "แนะนำสำหรับคุณ" และ "เลือกฝึกเอง" ในภาพ 06, "ประมาณ N นาที"
- undo, จำกัดการ์ดใหม่/ต่อวัน, ปรับพารามิเตอร์ FSRS จากประวัติ (optimizer), fuzz
- คิว IndexedDB / service worker / `GET /api/reviews/queue` (ออฟไลน์เต็มรูปแบบ), Web Push "คำศัพท์ถึงกำหนด"
- รวม `srs_reviews.duration_ms` เข้า "เวลาฝึกรวมต่อสัปดาห์" (ทำพร้อมหน้าพัฒนาการ)

## 10. เอกสาร/โค้ดที่ไม่ตรงกัน (พบตอนวางแผน)
1. ~~`docs/PROGRESS.md:48` ("รู้จริง" ต้องมีสองทิศ) ขัดกับภาพ 23–24 (ทิศเดียว)~~ ผู้ใช้เลือกสองทิศแล้ว (ข้อ 7.3) สูตรและเอกสารถูกต้องตามที่เขียน ไม่ต้องแก้ ที่ต้องเพิ่มคือ PROGRESS §2: การ์ดทั้งสองทิศเกิดเมื่อจบบท (`th_en` ถึงกำหนดช้ากว่า 1 วัน) และ "คำที่เรียนแล้ว" บนหน้าแรก = จำนวนคำที่มีการ์ด (PR 3)
2. `src/db/schema.ts:140`, `docs/ARCHITECTURE.md:222` และ `docs/PROGRESS.md:59` อ้าง "ฟิลด์ของ ts-fsrs" ซึ่งเป็นรูปแบบรุ่น 5 ts-fsrs ปัจจุบันคือรุ่น 6 (API และค่าเริ่มต้นต่างไป) ให้ถือว่า **รูปแบบที่เก็บเป็นของเราเอง** (ข้อ 3.3) และแก้ถ้อยคำในเอกสารสามที่นี้ใน PR 2
3. `srs_reviews` ไม่มี `session_id` และ FK ไปการ์ด, `srs_cards` ไม่มี `created_at`: เอกสารไม่ได้พูดถึง แก้ใน migration 0004 (ข้อ 3.1)
4. `docs/ARCHITECTURE.md:54` วาง `src/app/review/` ไว้นอก route group ถ้าทำตามจะได้หน้าทวนที่ไม่มีทั้งเมนูและ `SpeechAudioProvider` ที่ถูกต้อง ให้ใช้ `src/app/(learn)/review/` (แก้เอกสารใน PR 6)
5. "ถึงกำหนด" ในเอกสาร (`docs/PROGRESS.md:195` "ถึงกำหนดในวันนั้น") ไม่ได้นิยามเทียบกับ `due` ที่เป็นเวลาแน่นอน แผนนี้กำหนด `due < เที่ยงคืนท้องถิ่นถัดไป` (ข้อ 8) ให้เขียนลง PROGRESS §5 ใน PR 3
