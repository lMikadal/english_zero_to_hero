# แผน: เล่นบทที่เรียนจบแล้วซ้ำ (ทั้งบท และทีละทักษะ)

สถานะ: แผนของ architect (2026-11-26) ยังไม่ได้เริ่มทำ อ่านคู่กับ `docs/ARCHITECTURE.md` §5/§5.1, `docs/PROGRESS.md` §1/§3/§5, `design/README.md` (ui-v2 "การตัดสินใจของผู้ใช้" และ "สิ่งที่การตัดสินใจนี้กระทบ")

คำขอของผู้ใช้: "ทำบทเรียนแบบ ฟัง พูด อ่าน เขียน ทั้งหมด ให้สามารถย้อนมาทำกี่ครั้งก็ได้" แล้วเลือกว่าเล่นซ้ำได้ทั้ง **ทั้งบท** และ **ส่วนทักษะเดียวของบท** (ออกเสียง / ฟัง / พูด / อ่าน / เขียน เท่าที่บทนั้นมี)

## 0. สิ่งที่ผู้ใช้ตัดสินใจแล้ว (ห้ามเปิดใหม่)

| # | การตัดสินใจ | ที่มา |
|---|---|---|
| U1 | เล่นซ้ำไม่เปลี่ยนคะแนนเดิมของบท (`progress.score`) | design/README.md "สิ่งที่การตัดสินใจนี้กระทบ" |
| U2 | ฝึกเพิ่มใช้เฉพาะเนื้อหาที่เรียนจบในบทประจำวันแล้ว ไม่เปิดเนื้อหาล่วงหน้า | design/README.md ตาราง "ฝึกเพิ่ม" |
| U3 | ฝึกเพิ่มนับสตรีคเมื่อจบชุดเท่านั้น: ชุด 10 ข้อ หรือเล่นบทเดิมซ้ำจนจบ ตอบข้อเดียวไม่นับ | design/README.md ตาราง "สตรีค" และข้อกระทบข้อแรก |
| U4 | คำตอบจากฝึกเพิ่มไม่นับเป็นการตรวจพบจุดอ่อน (เหมือน `drill`) | design/README.md ข้อกระทบ |
| U5 | `attempts.source` และ `activity_days.source` มีค่าใหม่ `practice` | design/README.md ข้อกระทบ |
| U6 | ทางเข้าคือหน้า ฝึกเพิ่ม (ภาพ 28 "เลือกบทเดิมมาเล่นซ้ำ") และหน้าเล่นไม่แสดงเมนูหลัก | คำสั่งของผู้ใช้ 2026-11-26 |

## 1. สิ่งที่เกิดขึ้นตอนนี้เมื่อเปิด `/day/N` ของวันที่จบแล้ว (ข้อเท็จจริงจากโค้ด)

1. หน้าเปิดให้เล่นได้ เพราะเงื่อนไขเดียวคือ `day <= current_day` (`src/lib/attempts/unlock.ts:6-8`, `src/app/(learn)/day/[day]/page.tsx:31`) ไม่มีการอ่าน `progress.status` เลย ตัวเล่นเป็นโหมดบทเรียนปกติทุกอย่าง
2. ทุก attempt ถูกส่งเป็น `source: "lesson"` (hardcode ที่ `src/components/player/LessonPlayer.tsx:116`) รอบแรก `attemptNo = 1` รอบทวนท้ายบท `attemptNo = 2` (`LessonPlayer.tsx:117`, `src/components/player/player-state.ts` ฟังก์ชัน `advance`) แต่ละครั้งที่เล่นได้ `sessionId` ใหม่ (`LessonPlayer.tsx:29`)
3. server รับไว้เป็นแถวใหม่ `source = 'lesson'` (`src/lib/server/attempts-handler.ts:101-117`) แล้ว `markInProgress` ไม่แตะวันที่ done (`src/db/queries/attempts.ts:45` `setWhere status <> 'done'`) และ `refreshDoneScore` คำนวณ `progress.score` ใหม่ทุกครั้ง (`attempts-handler.ts:133-137`, `attempts.ts:54-64`) โดยนับเฉพาะ attempt ที่ `created_at <= completed_at` (`attempts.ts:61`, `src/db/queries/progress.ts:47-62`)
   - ผล: **ปกติคะแนนเดิมไม่เปลี่ยน** (มีเทสต์ `src/lib/server/complete-handler.int.test.ts:133`) แต่ **เปลี่ยนได้** ถ้า `created_at` ของ attempt ที่เล่นซ้ำ (เวลาเครื่อง client ที่ตัดเข้า `[floor, now]`, `src/lib/server/clamp.ts:13-16`) ไม่เกิน `completed_at` เช่น นาฬิกาเครื่องถูกตั้งย้อนหลัง เพราะสูตรเลือก "แถวล่าสุดต่อ exercise" (`src/lib/progress/lesson-score.ts:8-22`) แถวของการเล่นซ้ำจะทับแถวเดิม
4. จบบท: `POST /api/lessons/complete` เห็นว่า done แล้ว จึงคืนค่าที่เก็บไว้โดยไม่เปลี่ยนอะไร (`src/lib/server/complete-handler.ts:44-51`) **สตรีคไม่เพิ่ม** (ไม่เรียก `touchStreak`) `current_day` ไม่เปลี่ยน
5. หน้าจบบทแสดง **คะแนนเดิมที่เก็บไว้** ไม่ใช่คะแนนของรอบนี้ (`src/components/player/CompletionScreen.tsx:15-16` คะแนนจาก server มาก่อนคะแนนในเครื่อง) แสดงสตรีคดิบ (บันทึกไว้แล้วที่ `docs/PLAN.md:76`) และแสดงปุ่ม "ไปบทถัดไป" ไป `/day/<current_day>` ถ้า `current_day > N` (`CompletionScreen.tsx:17,49`) เช่น เล่นวันที่ 1 ซ้ำตอนอยู่วันที่ 5 ปุ่ม "บทถัดไป" พาไปวันที่ 5
6. **ผิดกฎ U4 อยู่แล้ววันนี้:** attempt ของการเล่นซ้ำเป็น `lesson` + `attempt_no = 1` จึงถูกนับเป็นหลักฐานจุดอ่อน (`src/lib/progress/config.ts:24` `DETECTION_SOURCES`, `src/lib/progress/weakness.ts:75-89`) และนับในอัตราผิดของ `evaluateWeakness` (`src/lib/progress/drills.ts:34,121-123`)

สรุป: ทางที่มีอยู่ไม่เปลี่ยนคะแนนในกรณีปกติและไม่นับสตรีค แต่บันทึกผิดประเภท (`lesson`) นับเป็นจุดอ่อน และหน้าจบบทแสดงข้อมูลที่ทำให้เข้าใจผิด แผนนี้ทำให้ทางนี้หายไป

## 2. รูปแบบที่เลือก (และจุดที่ต่างจากข้อเสนอเดิม)

- **ไม่มีตัวเล่นใหม่:** `LessonPlayer` ตัวเดิม เพิ่มโหมด `practice`
- **URL: ใช้ `/day/N` เดิม ไม่สร้าง `/replay/N`** วันที่ `progress.status = 'done'` เปิดเป็นโหมด practice เสมอ และรับ `?skill=<skill>` เพื่อเล่นเฉพาะส่วนนั้น วันที่ยังไม่ done เป็นโหมดบทเรียนเหมือนเดิม
  - เหตุผลจากโค้ด: หลังจบบท `DayPlayer` เรียก `router.refresh()` (`src/components/player/DayPlayer.tsx:16`, `LessonPlayer.tsx:74-79`) ซึ่งให้ server render หน้า `/day/N` ใหม่ ตอนนั้นวันนั้นเพิ่งกลายเป็น done ถ้าหน้าที่ done ทำ `redirect('/replay/N')` หรือ render สิ่งอื่นแทน `DayPlayer` หน้าจบบทของการเรียนครั้งแรกจะถูกแทนที่ทันที (ผู้เรียนไม่เห็นคะแนน/สตรีค) ส่วนการใช้ `/day/N` เดิมแล้วให้ `LessonPlayer` **จำโหมดตอน mount** ทำให้ refresh ไม่มีผล และ "ทางที่ผิด" (เล่นซ้ำเป็น `lesson`) หายไปเพราะวันที่ done ไม่มีโหมด lesson อีกแล้ว
  - (ข้อสรุปเรื่อง redirect ระหว่าง `router.refresh()` มาจากการอ่านโค้ดและพฤติกรรมที่รู้ของ Next.js App Router ยังไม่ได้รันพิสูจน์ ถ้าทีมอยากได้ `/replay/N` จริง ต้องแก้ `onDone` ก่อนและมีเทสต์ E2E ยืนยัน)
- attempt ของ practice ส่ง `source: "practice"` ตรวจที่ server เหมือนเดิม กันซ้ำด้วย id ของ client ผูกกับ `sessionId`
- จบการเล่นซ้ำเรียก endpoint ใหม่ `POST /api/practice/complete` ที่ **ไม่แตะ `progress` และ `profiles`** คืนคะแนนของ session นี้ (attempt แรกเท่านั้น สูตรเดียวกับบท) และเฉพาะการเล่นทั้งบทเท่านั้นที่บันทึกวันกิจกรรมสำหรับสตรีค
- หน้า `/practice` แสดงรายการวันที่จบแล้ว (ใหม่สุดก่อน) แต่ละแถวกางออกได้ (`<details>`) มีปุ่ม "เล่นทั้งบท" และปุ่มต่อทักษะที่บทนั้นมี ไม่มี UI ทวนคำศัพท์ / จุดอ่อน / ชุด 10 ข้อ (ยังไม่มีจริง)
  - ไม่ทำหน้าเลือกแยก (`/practice/N`) เพราะ `src/app/(main)/layout.test.tsx:28-29` บังคับว่ากลุ่ม `(main)` มีแค่ 4 หน้าเมนู และ `<details>` ไม่ต้องมี route/JS เพิ่ม

## 3. กติกาพฤติกรรม

### 3.1 การเข้าถึง (หน้า `/day/[day]`)
1. ตรวจรูปแบบวันและการล็อกเหมือนเดิม (`page.tsx:20-41`) ลำดับ: 404 รูปแบบวันผิด → DB error → ล็อก (`day > current_day`) → อ่านบท → ตัดสินโหมด
2. โหมด = `practice` เมื่อ `progress.status` ของวันนั้นเป็น `done` ไม่เช่นนั้น `lesson`
3. `?skill` รับค่าเดียวจาก `pronunciation | listening | speaking | reading | writing` (`SKILLS` ใน `src/lib/content/schema.ts:7`) ค่าอื่น (รวม `vocabulary`, ว่าง, ส่งซ้ำหลายค่า, ตัวพิมพ์ใหญ่) → 404 เหมือน `/day/007`
4. `?skill` ที่ถูกต้องแต่วันยังไม่ done (ปลดล็อกแล้ว) → `StatusScreen` "ฝึกแยกส่วนได้หลังเรียนบทนี้จบ" + ลิงก์ "ไปเรียนบทวันที่ N" → `/day/N` (ไม่เล่นโหมด lesson ที่กรองส่วน เพราะจะได้คะแนนบทจากบางส่วน)
5. `?skill` ที่บทนั้นไม่มีส่วนนั้น → `StatusScreen` "บทนี้ไม่มีส่วน<ชื่อทักษะไทย>" + ลิงก์ "กลับไปหน้าฝึกเพิ่ม" → `/practice`
6. บทของวันที่ done แต่ไฟล์บทหาย/เสีย → หน้า "ยังไม่มีบทเรียนของวันนี้" เดิม
7. โหมดถูกจำตอน mount ของ `LessonPlayer` (`useState` initializer) **ห้ามใส่โหมดใน `key`** ของ `LessonPlayer` (key = `${day}-${skill ?? "all"}`) เพื่อให้ `router.refresh()` หลังจบบทครั้งแรกไม่ทำให้ตัวเล่น mount ใหม่เป็น practice
8. หน้าเล่นอยู่ในกลุ่ม `(learn)` เดิม จึงไม่มีเมนูหลัก (U6) และหัวของตัวเล่นในโหมด practice แสดงป้าย "เล่นซ้ำ" (ทั้งบท) หรือ "เล่นซ้ำ · <ชื่อทักษะไทย>"

### 3.2 การเล่น
9. ทั้งบท: ทุกส่วนตามลำดับเดิม ทีละทักษะ: เฉพาะทุกส่วนที่ `section.skill === skill` ตามลำดับในบท (ถ้าบทหนึ่งมีสองส่วนทักษะเดียวกันจะเล่นทั้งสอง) ใช้ฟังก์ชันล้วน `replaySections(lesson, skill)` ตัวเดียวทั้ง client และ server
10. **รอบทวนท้ายบทคงไว้ในโหมด practice** (แนะนำ): เป็นวงจรเรียนรู้เดียวกับบท ไม่กระทบคะแนนเพราะคะแนน session ใช้เฉพาะ `attempt_no = 1` attempt รอบทวนส่ง `source: "practice", attemptNo: 2`
11. ข้อประเมินตัวเอง (`repeat_after_me`, `shadowing`, `speak_answer`) และ `free_write`: บันทึกเหมือนเดิม `score = null` ไม่นับในคะแนน session ส่วนที่ไม่มีข้อให้คะแนนเลย (เช่น ส่วนพูดของวันที่ 1–7 ทั้งหมด) จบได้ คะแนน session เป็น `null` หน้าจบแสดง "ส่วนนี้ประเมินตัวเอง ไม่มีคะแนน"
12. ทุก attempt ในโหมด practice มี `source: "practice"` (รวมรอบทวน) ห้ามมี `lesson` ปน

### 3.3 server: attempt
13. item ที่ `source = 'practice'` ของวันที่ `progress.status <> 'done'` (หรือไม่มีแถว) → `rejected` reason ใหม่ `not_finished` (U2) ตรวจหลัง `locked_day`
14. attempt `practice` **ไม่แตะ `progress` เลย**: ไม่เข้า `firstCreated` จึงไม่เรียก `markInProgress` / `refreshDoneScore` (`attempts-handler.ts:122-125,133-137`) ทำผ่านตาราง `SOURCE_ROLES` (ข้อ 4.4) ไม่ใช่ `if` ลอยๆ
15. คะแนนบท (`computeLessonScore`, `progress.ts:55`) กรอง `source = 'lesson'` อยู่แล้ว จึงไม่นับ practice แม้ `created_at <= completed_at` (เพิ่มเทสต์พิสูจน์)
16. attempt `lesson` ของวันที่ done ยังรับเหมือนเดิม (กรณีจบบทชนะ race กับ attempt ของตัวเอง `attempts.ts:50-53` ต้องยังทำงาน) ไม่ปฏิเสธ เพราะแยกไม่ออกจากกรณีที่ถูกต้อง หลัง PR นี้ client ที่ถูกต้องไม่ส่งแบบนี้อีก (คิวอยู่ในหน่วยความจำ `src/lib/offline/http-sink.ts:2` จึงไม่มีรายการรูปแบบเก่าค้างข้าม deploy)

### 3.4 server: จบการเล่นซ้ำ (`POST /api/practice/complete`)
17. ตรวจ: body ผิด → 400; บทไม่มี/โหลดไม่ได้, วันยังไม่ done, หรือ `skill` ที่บทไม่มี → 409 `{error:"not_replayable"}`
18. ไม่เขียน `progress`, `profiles` (รวม `current_day`), `attempts` ใดๆ
19. คะแนน session = `lessonScore()` (`src/lib/progress/lesson-score.ts`) ของแถว `user_id`, `day`, `session_id`, `source = 'practice'`, `attempt_no = 1`, `score IS NOT NULL` และ `exercise_id` อยู่ใน `replaySections(lesson, skill)` (กันแถวนอกส่วนที่เลือก) `graded` = จำนวน exercise ที่มีคะแนน
20. สตรีค (U3): เฉพาะ `skill = null` (ทั้งบท) เรียก `touchStreak(tx, userId, localDate(clampedCompletedAt, tz), "practice")` ทีละทักษะไม่นับ (**ตีความ ต้องให้ผู้ใช้ยืนยัน** ข้อ 7.1) วันที่ใช้กติกาเดียวกับบท: `completedAt` ของ client ตัดเข้า `[floor, now]` แล้วแปลงเป็นวันที่ตามเขตเวลา (`complete-handler.ts:40-41,57`)
21. วันที่มีกิจกรรมอยู่แล้ว: `activity_days` PK `(user_id, local_date)` + `onConflictDoNothing` (`progress.ts:33`) จึงไม่เพิ่มแถว สตรีคไม่เปลี่ยน และ `source` ของวันนั้นคงเป็นค่าของกิจกรรมแรก (ไม่มีโค้ดใดอ่าน `activity_days.source` ตอนนี้ ตรวจด้วย grep แล้ว)
22. จบ session เดิมซ้ำ (client ส่ง request เดิมซ้ำ `LessonPlayer.tsx:42`, หรือคิวส่งซ้ำ): คืนผลเดียวกัน (คะแนนคำนวณจาก attempt ชุดเดิม, `touchStreak` ซ้ำวันเดิมไม่มีผล) ไม่ต้องมีตาราง session ใหม่
23. จบโดยไม่มี attempt เลย (ทุกข้อถูก "ข้าม" เพราะเครื่องไม่มีเสียง) ยอมรับ: คะแนน `null`, ทั้งบทยังนับสตรีค (ผู้ใช้คนเดียว ไม่มีโมเดลการโกง; ดูความเสี่ยง R4)
24. ลำดับล็อก: อ่าน profile (ไม่ล็อก) → อ่าน progress (ไม่ล็อก) → `touchStreak` (ล็อกแถว streaks) จบบทล็อก profile → progress → streaks (`complete-handler.ts:36`) จึงไม่มีวงจร deadlock

### 3.5 ออฟไลน์ / รีโหลด
25. ออฟไลน์ระหว่างเล่น: attempt เข้าคิวเดิม; การจบเข้าคิวเป็นรายการชนิด complete ตามลำดับ FIFO หน้าจบแสดง "จะบันทึกเมื่อออนไลน์" และคะแนนในเครื่อง (`firstAttemptScore`) เมื่อคิวว่างถามซ้ำแล้วเปลี่ยนเป็นผลจริง (กลไกเดียวกับ `LessonPlayer.tsx:57-72`) การเปิดหน้า `/day/N` ขณะออฟไลน์ยังไม่ได้ (ต้องรอ service worker เหมือนบทปกติ)
26. รีโหลดกลางทาง: ตัวเล่นเริ่มใหม่ด้วย `sessionId` ใหม่ (ปัญหาเดียวกับบทปกติ `docs/PLAN.md:71`) attempt ที่ส่งไปแล้วเป็นแถว practice ของ session ที่ไม่จบ ไม่นับสตรีค ไม่กระทบอะไร `UnsavedGuard` เตือนเหมือนเดิมถ้ามีรายการค้าง

### 3.6 หน้าจบ (practice)
27. h1 "จบการเล่นซ้ำแล้ว"; การ์ด: "คะแนนรอบนี้ N%" (server ถ้า done ไม่งั้นคะแนนในเครื่อง; ถ้า `null` → "ส่วนนี้ประเมินตัวเอง ไม่มีคะแนน"), "คะแนนเดิมของบท M% (ไม่เปลี่ยน)" (จาก response; `null` → ไม่แสดงบรรทัด), ทั้งบท: "สตรีค X วัน (นานที่สุด Y วัน)" ทีละทักษะ: "ฝึกแยกส่วนไม่นับสตรีค นับเมื่อเล่นทั้งบทจนจบ"
28. ปุ่ม: "เล่นอีกครั้ง" (ลิงก์ URL เดิม, mount ใหม่ = session ใหม่) "กลับไปหน้าฝึกเพิ่ม" → `/practice` และ "กลับหน้าแรก" → `/` **ไม่มี "ไปบทถัดไป"**
29. `queued` / `rejected` / `error` ใช้ข้อความรูปแบบเดิม แต่ 409 = "บทนี้ยังเล่นซ้ำไม่ได้ (ยังเรียนไม่จบ หรือไม่มีส่วนนี้)"

### 3.7 หน้า `/practice`
30. h1 "ฝึกเพิ่ม", บรรทัดใต้หัว "เล่นบทที่เรียนจบแล้วซ้ำได้ไม่จำกัด คะแนนเดิมของบทไม่เปลี่ยน เล่นทั้งบทจนจบนับสตรีค"; h2 "เล่นบทที่เรียนแล้วซ้ำ"
31. รายการ: วันที่ `progress.status = 'done'` เรียงวันมากไปน้อย แต่ละแถว (`<details>`): เลขวัน, ชื่อบท (`title.en` `lang="en"` + `title.th`) จาก `content/`, คะแนนเดิม `M%` (หรือ "—" ถ้า `null`) เมื่อกาง: ลิงก์ "เล่นทั้งบท" → `/day/N` และลิงก์ต่อทักษะที่บทมี ตามลำดับในบท ข้อความ = ชื่อทักษะไทย (`ออกเสียง` `ฟัง` `พูด` `อ่าน` `เขียน`) + จำนวนข้อ → `/day/N?skill=<skill>`
32. วันที่ done แต่ไฟล์บทหาย: แถวแสดง "วันที่ N · ไม่มีเนื้อหา" ไม่มีลิงก์
33. ยังไม่มีวันที่จบ: "ยังไม่มีบทที่เรียนจบ เรียนบทแรกให้จบก่อน" + ลิงก์ "ไปบทเรียนวันนี้" → `/`
34. DB ล่ม → `DbErrorScreen` (`retryHref="/practice"`)
35. ไม่มีปุ่ม/ข้อความของทวนคำศัพท์, จุดอ่อน, ชุด 10 ข้อ, วันที่ล็อก (ภาพ 28 แสดงแถว "วันนี้"/"ล็อก" ไม่ทำ ดูข้อ 7.4)
36. `force-dynamic` และทุกเป้าแตะ ≥ 44px, ใช้ได้ที่ 360px ไม่มี horizontal scroll

### 3.8 สูตรพัฒนาการ (`src/lib/progress/*` และ query)

| ฟังก์ชัน | ตอนนี้กรอง `source` อย่างไร | ต้องทำ |
|---|---|---|
| `types.ts` `AttemptSourceLike` (บรรทัด 5) | ไม่มี `practice` | เพิ่ม `practice` + type test ว่าเท่ากับ `AttemptSource` ใน `src/db/schema.ts` (ตอนนี้ไม่มีเทสต์นี้) |
| `config.ts:24` `DETECTION_SOURCES` | allowlist `lesson`, `checkpoint` | สร้างจาก `SOURCE_ROLES` (ข้อ 4.4) ค่าเท่าเดิม |
| `weakness.ts` `detectionAttempts` / `groupStats` | ผ่าน `DETECTION_SOURCES` ไม่นับ practice อยู่แล้ว | เทสต์: เพิ่ม attempt practice ที่ผิดทั้งหมดแล้วผลไม่เปลี่ยน |
| `drills.ts:34-35` `isLessonSource` / `isDrillSource` | allowlist แยกเอง | ใช้ `SOURCE_ROLES` แทน; เทสต์ `evaluateWeakness`, `weakPoints`, `recommendDrills` ไม่เปลี่ยนเมื่อมี practice (practice ไม่ใช่ทั้งหลักฐานและไม่ใช่กิจกรรม drill: ไม่เปิดรอบ `in_progress`) |
| `drills.ts` `matchesWeakness` | practice ตกไปทาง `groupKeys` | ไม่เป็นไรเพราะถูกกรองทีหลัง ครอบด้วยเทสต์ข้างบน |
| `drills.ts` `sessionResults` | เฉพาะ `retest` | ไม่ต้องแก้ |
| `lesson-score.ts` `lessonScore` | ไม่กรอง (ผู้เรียกกรอง) | ไม่แก้; ใช้ซ้ำสำหรับคะแนน session |
| `db/queries/progress.ts:47` `computeLessonScore` | `source = 'lesson'` | ขยายเทสต์ `complete-handler.int.test.ts:145` ให้มี practice ที่ `created_at <= completed_at` |
| `db/queries/attempts.ts` `refreshDoneScore`, `markInProgress` | ไม่ดู source | ไม่ถูกเรียกสำหรับ practice (ข้อ 14) |
| `vocab.ts`, `pace.ts`, `cefr.ts`, `score.ts` | ไม่อ่าน attempts (SRS / progress) | ไม่ต้องแก้ practice ไม่เขียน progress จึงไม่กระทบ pace/CEFR |
| `streak.ts` `computeStreak` | รับชุดวันที่ ไม่สนใจ source | ไม่ต้องแก้ (practice เพิ่มวันโดยตั้งใจ) |

## 4. สัญญาที่ใช้ร่วมกัน (ทั้งหมดอยู่ใน PR 1)

### 4.1 DB (`src/db/schema.ts` + `make db-generate` → `src/db/migrations/0003_*.sql`)
```ts
export const ATTEMPT_SOURCES = ["lesson", "drill", "retest", "checkpoint", "practice"] as const;
export const ACTIVITY_SOURCES = ["lesson", "practice"] as const; // SRS PR จะเพิ่ม "review"
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];
// attempts: CHECK attempts_source_valid ใช้ ATTEMPT_SOURCES ใหม่ (drop + add constraint)
//           index ใหม่ attempts_user_id_session_id_idx (user_id, session_id)  -- คะแนน session; retest ใช้ด้วยภายหลัง
// activity_days: source .$type<ActivitySource>() + CHECK activity_days_source_valid IN ACTIVITY_SOURCES
```
แถวเดิมเป็น `lesson` ทั้งหมด migration จึงไม่ทำลายข้อมูล ผู้ตรวจต้องอ่าน SQL ที่ generate ว่าเป็น `DROP CONSTRAINT`/`ADD CONSTRAINT`/`CREATE INDEX` เท่านั้น

### 4.2 `src/lib/attempts/contract.ts`
```ts
export const ATTEMPT_SOURCES = ["lesson", "drill", "retest", "checkpoint", "practice"] as const;
export const API = { attempts: "/api/attempts", completeLesson: "/api/lessons/complete", completePractice: "/api/practice/complete" } as const;

export type RejectedReason = "unknown_exercise" | "kind_mismatch" | "unsupported" | "locked_day" | "not_finished" | "invalid";

/** Section skills a replay can pick (same values as SKILLS in src/lib/content/schema.ts). */
export const REPLAY_SKILLS = ["pronunciation", "listening", "speaking", "reading", "writing"] as const;
export type ReplaySkill = (typeof REPLAY_SKILLS)[number];

export const completePracticeRequestSchema = z.strictObject({
  kind: z.literal("replay"),            // ชุด 10 ข้อในอนาคตจะเป็นอีก kind ของ union นี้
  day: z.number().int().min(1).max(365),
  skill: z.enum(REPLAY_SKILLS).nullable(), // null = ทั้งบท
  sessionId: z.uuid(),
  completedAt: isoTimestamp,
});
export type CompletePracticeRequest = z.infer<typeof completePracticeRequestSchema>;
export type CompletePracticeResponse = {
  session: { sessionId: string; day: number; skill: ReplaySkill | null; score: number | null; graded: number };
  lessonScore: number | null;          // progress.score เดิม (อ่านอย่างเดียว) ไว้แสดง
  streak: { current: number; longest: number };
  countedForStreak: boolean;
};
```
type test: `ReplaySkill` เท่ากับ `Section["skill"]`; `ATTEMPT_SOURCES` เท่ากับ `AttemptSource` (มีอยู่แล้ว `contract.test.ts:29-31` แก้ array ที่คาด)

**ทำไม endpoint ใหม่ ไม่ใช่ฟิลด์ใน `/api/lessons/complete`:** response คนละรูป (ไม่มี `progress`/`currentDay`), กติกาตรงข้าม (ห้ามแตะ progress) และ handler แยกไฟล์ทำให้บังคับด้วยเครื่องได้ว่าไฟล์นั้น import ฟังก์ชันเขียน progress ไม่ได้ (ข้อ 4.5) ถ้าใส่เป็น flag ในตัวเดิม การลืมเช็ก flag หนึ่งที่ = เขียนทับคะแนนบท ส่วน attempt ใช้ `/api/attempts` เดิมเพราะแตกต่างแค่ `source`

### 4.3 `src/lib/offline/sink.ts`
```ts
export type CompleteResult<R = CompleteLessonResponse> =
  | { status: "done"; response: R } | { status: "queued" } | { status: "rejected"; code: 400 | 409 };
export interface SyncSink {
  sendAttempt(a: AttemptInput): void;                 // AttemptInput.source บังคับอยู่แล้ว (contract.test.ts:102)
  completeLesson(c: CompleteLessonRequest): Promise<CompleteResult>;
  completePractice(c: CompletePracticeRequest): Promise<CompleteResult<CompletePracticeResponse>>;
  pendingCount(): number;
  subscribe(cb: () => void): () => void;
}
```
`http-sink.ts`: `Entry` ชนิด complete เก็บ `url` + ตัวตรวจ response (`isCompleteResponse` / `isPracticeResponse`) กติกา FIFO, retry, 409/400 เหมือน `completeLesson` ทุกอย่าง กันซ้ำในคิวด้วย `sessionId` (lesson ใช้ `day`+`sessionId` ตามเดิม `http-sink.ts:271`) ไม่มีการเปลี่ยนอื่น fake sink ในเทสต์ (`LessonPlayer.guard.test.tsx:31-36`, `LessonPlayer.test.tsx:18-23`) เพิ่ม `completePractice` ใน PR 1 เพื่อให้ typecheck ผ่าน

### 4.4 `src/lib/progress/sources.ts` (ใหม่) — บังคับให้ทุก source ถูกจัดประเภท
```ts
export const SOURCE_ROLES = {
  lesson:     { detection: true,  drillActivity: false, touchesProgress: true  },
  checkpoint: { detection: true,  drillActivity: false, touchesProgress: true  },
  drill:      { detection: false, drillActivity: true,  touchesProgress: true  },
  retest:     { detection: false, drillActivity: true,  touchesProgress: true  },
  practice:   { detection: false, drillActivity: false, touchesProgress: false },
} as const satisfies Record<AttemptSourceLike, { detection: boolean; drillActivity: boolean; touchesProgress: boolean }>;
```
(`touchesProgress` ของ drill/retest/checkpoint = พฤติกรรมเดิมของ `attempts-handler.ts:122-137` ไม่เปลี่ยนใน PR นี้) เพิ่ม source ใหม่ในอนาคตแล้วไม่จัดประเภท = compile error `DETECTION_SOURCES`, `isLessonSource`, `isDrillSource` และ attempts-handler อ่านจากตารางนี้

### 4.5 คำค้น/helper ที่ทั้งสองฝั่งใช้
- `src/lib/practice/replay.ts` (client-safe, ฟังก์ชันล้วน): `parseReplaySkill(raw: string | string[] | undefined): ReplaySkill | null | "invalid"`, `replaySkills(lesson): { skill: ReplaySkill; exercises: number }[]` (ตามลำดับในบท, รวมส่วนซ้ำ), `replaySections(lesson, skill: ReplaySkill | null): Section[]`, `REPLAY_SKILL_LABEL_TH: Record<ReplaySkill, string>`
- `src/db/queries/practice.ts`: `listDoneDays(db, userId): Promise<{ day: number; score: number | null; completedAt: Date }[]>` (ใหม่สุดก่อน) และ `getDayStatus(db, userId, day): Promise<ProgressStatus>` (`not_started` ถ้าไม่มีแถว)

### 4.6 ใครเป็นเจ้าของไฟล์ไหน
| PR | ไฟล์ |
|---|---|
| 1 contract (ทำก่อน คนเดียว) | `src/db/schema.ts`, `src/db/migrations/0003_*` + `meta/`, `src/lib/attempts/contract.ts` (+test), `src/lib/offline/sink.ts`, `src/lib/offline/http-sink.ts` (+test), fake sink ใน `src/components/player/LessonPlayer*.test.tsx` (เพิ่ม stub เท่านั้น), `src/lib/progress/{types,config,sources,drills}.ts` (+tests weakness/drills/sources), `src/lib/practice/replay.ts` (+test), `src/db/queries/practice.ts` (+int test) |
| 2 backend | `src/lib/server/attempts-handler.ts` (+int tests), `src/lib/server/practice-complete-handler.ts` (ใหม่ +int test), `src/app/api/practice/complete/route.ts` (ใหม่), `src/app/api/routes.test.ts`, `src/db/queries/progress.ts` (type ของ `source` ใน `touchStreak`), `src/lib/server/complete-handler.int.test.ts` (เทสต์ข้อ 15), `eslint.config.mjs`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`, ตาราง API ใน `docs/FEATURE_MAP.md` |
| 3a frontend ตัวเล่น | `src/components/player/{LessonPlayer,DayPlayer,player-state}.tsx/ts` (+tests), `src/components/player/PracticeCompletionScreen.tsx` (ใหม่ +test), `src/app/(learn)/access.ts`, `src/app/(learn)/day/[day]/page.tsx` (+test), แถว `/day/N` ใน `docs/FEATURE_MAP.md` |
| 3b frontend รายการ | `src/app/(main)/practice/page.tsx` (+test), `src/app/(main)/layout.test.tsx` (mock query ใหม่), แถว `/practice` ใน `docs/FEATURE_MAP.md` |
| 4 E2E + ปิดงาน | `e2e/replay.spec.ts` (ใหม่), helper ที่แยกจาก `e2e/lesson.spec.ts` (ถ้าจำเป็น), `docs/FEATURE_MAP.md` (คอลัมน์เทสต์), `docs/PLAN.md`, `design/README.md` |

PR 2 กับ 3a/3b ทำคู่ขนานได้หลัง PR 1 merge (ไม่แก้ไฟล์เดียวกัน; `FEATURE_MAP.md` คนละตาราง/คนละแถว ถ้าชนให้ rebase) 3a กับ 3b เป็นคนเดียวกันทำต่อกันได้

## 5. แผน PR

ทุก PR: เขียนเทสต์ที่ล้มก่อนแล้ว commit ก่อนโค้ด, ผ่าน `make check`, integration test รันจาก main checkout ทีละตัว (decisions ข้อ 7)

### PR 1 `feat/replay-contract` — สัญญา, migration, การจัดประเภท source
- เทสต์ก่อน: `contract.test.ts` (array/type ใหม่, `completePracticeRequestSchema` รับ/ปฏิเสธ: `skill` `"vocabulary"`, ขาด `kind`, ฟิลด์เกิน), `sources.test.ts` (type test `AttemptSourceLike` = `AttemptSource`; `DETECTION_SOURCES` ยังเป็น `["lesson","checkpoint"]`), `weakness.test.ts`/`drills.test.ts` ("practice ไม่เปลี่ยน `groupStats`/`weakPoints`/`evaluateWeakness`/`recommendDrills`": ชุดเดิม + practice ผิดทั้งหมด ผลต้อง `toEqual` ชุดเดิม), `replay.test.ts` (วันที่ 1: 5 ทักษะ จำนวนข้อ 3/2/2/1/2; `parseReplaySkill` กับ `"Listening"`, `["a","b"]`, `""`), `http-sink.test.ts` (completePractice: FIFO หลัง attempt, 409 → rejected, 5xx → queued, กันซ้ำด้วย sessionId, response รูปผิด → retry), `practice.int.test.ts` (`listDoneDays` เรียงใหม่สุดก่อน ไม่รวม in_progress; `getDayStatus` ไม่มีแถว = `not_started`), schema int test: insert attempt `source='practice'` ได้, `'foo'` → 23514, activity_days `'foo'` → 23514
- ตรวจด้วยเครื่อง: `Record<AttemptSourceLike, …>` (compile), type tests, CHECK constraint
- ตรวจกับแอปจริง: `make db-migrate` แล้ว `psql -c "\d+ attempts"` เห็น `attempts_source_valid` มี `'practice'` และ index `attempts_user_id_session_id_idx`; `\d+ activity_days` เห็น `activity_days_source_valid` แอปเดิมยังเล่น `/day/1` ได้เหมือนเดิม

### PR 2 `feat/replay-server` — server
- เทสต์ก่อน (int):
  - `attempts-handler.int.test.ts`: practice ของวันที่ไม่ done → `rejected/not_finished`; ของวันที่ done → `created` แถว `source='practice'`, `attempt_no` ตามที่ส่ง; batch ปน lesson+practice ได้ผลต่อรายการถูก
  - **guard หลัก "practice ไม่แตะ progress/profiles"** (`practice-guard.int.test.ts`): จบวันที่ 1 แบบปกติ, snapshot ทุกแถวของ `progress` และ `profiles` แล้วส่ง attempt practice (ถูก/ผิด, `attemptNo` 2, `createdAt` ก่อน `completed_at`) + complete practice ทั้งบทและทีละทักษะ + complete ซ้ำ → snapshot ต้อง `toEqual` เดิม
  - `practice-complete-handler.int.test.ts`: คะแนน session = ค่าเฉลี่ยข้อแรก (ไม่นับ attempt_no 2, score null, session อื่น, ข้อนอกทักษะ); ทั้งบท → แถว `activity_days(source='practice')` + streak เพิ่มเมื่อวันใหม่ (ตั้ง `now` ให้เป็นวันถัดไป); ทีละทักษะ → ไม่มีแถว `countedForStreak:false`; วันที่มีกิจกรรมแล้ว → ไม่มีแถวใหม่ source เดิมคงอยู่; เรียกซ้ำ → ผลเหมือนกัน; 409 วันไม่ done / ไม่มีบท / ไม่มีส่วนนั้น; 400 body ผิด; สองคำขอพร้อมกันนับครั้งเดียว
  - `complete-handler.int.test.ts:145`: เพิ่ม attempt practice ที่ `created_at <= completed_at` คะแนนบทยังเป็น 0
  - `routes.test.ts`: route ใหม่ใช้ `runJsonRoute` (415/400/413 เหมือนตัวอื่น)
- ตรวจด้วยเครื่อง: `eslint.config.mjs` เพิ่ม `no-restricted-imports` เฉพาะ `src/lib/server/practice-*.ts` ห้าม import `finishProgress`, `advanceCurrentDay`, `lockProgress` จาก `@/db/queries/progress` และ `markInProgress`, `refreshDoneScore` จาก `@/db/queries/attempts` (ลอง import แล้ว `make lint` ต้องล้ม); `touchStreak` รับ `source: ActivitySource`
- เอกสาร: ARCHITECTURE §4 (`activity_days.source` ค่า + CHECK), §5.1 (`not_finished`, endpoint ใหม่, ตาราง source), PROGRESS §1 (`practice` ใน `attempts.source`), §3 (practice ไม่นับ), §5 (สตรีคนับเมื่อเล่นทั้งบทซ้ำจนจบ)
- ตรวจกับแอปจริง (แถวใหม่ใน FEATURE_MAP ตาราง API):
  - `curl -s -XPOST localhost:3000/api/practice/complete -H 'content-type: application/json' -d '{"kind":"replay","day":1,"skill":null,"sessionId":"<uuid>","completedAt":"<ISO>"}'` ก่อนจบวันที่ 1 → 409 `{"error":"not_replayable"}`; หลังจบ → 200 มี `session.score`, `lessonScore`, `streak`, `countedForStreak:true`
  - POST `/api/attempts` item `source:"practice"` วันที่ 1 ที่ done → `created`; `select source, attempt_no, session_id from attempts order by created_at desc limit 3` เห็น `practice`; `select score, completed_at from progress where day=1` ไม่เปลี่ยนก่อน/หลัง

### PR 3a `feat/replay-player` — ตัวเล่นโหมด practice + หน้า `/day/N`
- เทสต์ก่อน:
  - `player-state.test.ts`: `createPlayerState({ lesson, sections })` ใช้เฉพาะส่วนที่ให้; รอบทวนยังสร้างในโหมด practice
  - `LessonPlayer.test.tsx`: โหมด practice ส่งทุก attempt `source:"practice"` (รวมรอบทวน), เรียก `completePractice` ด้วย `{kind:"replay", day, skill, sessionId}` ไม่เรียก `completeLesson`; โหมด lesson ส่ง `lesson` และไม่เรียก `completePractice`
  - **guard refresh**: render `DayPlayer` โหมด lesson เล่นจนจบ (`done`) แล้ว rerender ด้วย `mode="practice"` → ยังเห็น "จบบทเรียนแล้ว" และ `completeLesson` ถูกเรียกครั้งเดียว `completePractice` ไม่ถูกเรียก
  - `PracticeCompletionScreen.test.tsx`: ข้อ 27–29 (ไม่มีลิงก์ "ไปบทถัดไป"; ทีละทักษะมีบรรทัด "ไม่นับสตรีค"; score null)
  - `day/[day]/page.test.tsx`: done → `DayPlayer` โหมด practice; ไม่ done → lesson; `?skill=listening` done → เฉพาะส่วนฟัง (`h2` ชื่อส่วนฟัง "ข้อ 1 / 2"); `?skill=vocabulary`/`x`/สองค่า → 404; `?skill` วันไม่ done → "ฝึกแยกส่วนได้หลังเรียนบทนี้จบ"; skill ที่บทไม่มี → "บทนี้ไม่มีส่วน…"
- ตรวจด้วยเครื่อง: `source` ใน `LessonPlayer` มาจาก `mode` ผ่านฟังก์ชันเดียว (`attemptSourceFor(mode)`) ไม่ hardcode; เทสต์ guard refresh
- ตรวจกับแอปจริง (ต้องมี PR 2 แล้ว): จบวันที่ 1 → เปิด `/day/1` เห็นป้าย "เล่นซ้ำ" เล่นจนจบ → h1 "จบการเล่นซ้ำแล้ว", "คะแนนรอบนี้", "คะแนนเดิมของบท … (ไม่เปลี่ยน)", ไม่มี "ไปบทถัดไป"; `/day/1?skill=reading` → "ข้อ 1 / 1" จบแล้วเห็น "ฝึกแยกส่วนไม่นับสตรีค"; DB: `select source, count(*) from attempts group by 1` มี `practice`, `progress` วันที่ 1 ไม่เปลี่ยน; `/day/1?skill=vocabulary` → 404; ที่ 360px ไม่มี horizontal scroll

### PR 3b `feat/practice-replay-list` — หน้า `/practice`
- เทสต์ก่อน (`practice/page.test.tsx` แทนเทสต์ placeholder เดิม): ข้อ 30–36 (mock `listDoneDays`, `getLesson`); ลำดับใหม่สุดก่อน; ลิงก์ของวันที่ 1 = `/day/1` + 5 ลิงก์ `?skill=`; empty state; ไฟล์บทหาย; DB error; ไม่มีข้อความ "ทวนคำศัพท์"/"จุดอ่อน"/"10 ข้อ"; `layout.test.tsx` mock query ใหม่และยังผ่าน
- ตรวจด้วยเครื่อง: `touch-targets.test.tsx` ครอบลิงก์ใหม่ (ถ้าไม่ครอบ เพิ่ม), color scan
- ตรวจกับแอปจริง: ฐานข้อมูลใหม่ `/practice` → "ยังไม่มีบทที่เรียนจบ"; จบวันที่ 1 → แถว "1 … M%" กางแล้วเห็น "เล่นทั้งบท", "ออกเสียง", "ฟัง", "พูด", "อ่าน", "เขียน"; แตะ "ฟัง" → URL `/day/1?skill=listening` ไม่มีเมนูหลัก

### PR 4 `test/replay-e2e` — E2E และปิดงาน
- `e2e/replay.spec.ts` (360px, ใช้ helper ตอบข้อจาก `lesson.spec.ts` ที่แยกออกมา): จบวันที่ 1 ผ่าน `request.post('/api/lessons/complete')` (จบได้โดยไม่มี attempt, ARCHITECTURE §5.1) → `/practice` → กางวันที่ 1 → "อ่าน" → ตอบ → "จบการเล่นซ้ำแล้ว"; กลับ `/practice` → "เล่นทั้งบท" → เล่นจนจบ (ข้ามข้อเสียงได้) → เห็นบรรทัดสตรีค; ตรวจผ่าน API/หน้าแรกว่าคะแนนเดิมไม่เปลี่ยน ใช้ส่วนอ่านเป็นหลักเพราะไม่ต้องใช้เสียง (ลดผลของ `docs/PLAN.md:71`)
- เอกสาร: คอลัมน์เทสต์ใน FEATURE_MAP, ติ๊ก/ปิดข้อ `docs/PLAN.md:76`, ขีดข้อที่ทำแล้วใน `design/README.md` "สิ่งที่การตัดสินใจนี้กระทบ" (source ใหม่, เล่นซ้ำไม่เปลี่ยนคะแนน, จุดอ่อนไม่นับ practice) และย้าย "เล่นซ้ำ 28" ไป "ทำแล้ว"

### แถวสำหรับ `docs/FEATURE_MAP.md` (คัดลอกได้)
| หน้าจอ/API | ไปถึงอย่างไร | พิสูจน์ว่าทำงาน | เทสต์ |
|---|---|---|---|
| ฝึกเพิ่ม `/practice` | แตะ "ฝึกเพิ่ม" ในแถบเมนู | h1 "ฝึกเพิ่ม"; h2 "เล่นบทที่เรียนแล้วซ้ำ"; ไม่มีวันที่จบ: "ยังไม่มีบทที่เรียนจบ เรียนบทแรกให้จบก่อน"; มี: แถววันที่จบ ใหม่สุดก่อน, ชื่อบท, คะแนนเดิม; กางแล้วมี "เล่นทั้งบท" → `/day/N` และลิงก์ทักษะ → `/day/N?skill=…` | `src/app/(main)/practice/page.test.tsx`, `e2e/replay.spec.ts` |
| `/day/N` เล่นซ้ำทั้งบท | `progress` วันที่ N = done แล้วเปิด `/day/N` | ป้าย "เล่นซ้ำ"; จบ → h1 "จบการเล่นซ้ำแล้ว", "คะแนนรอบนี้ N%", "คะแนนเดิมของบท M% (ไม่เปลี่ยน)", สตรีค, ไม่มี "ไปบทถัดไป"; DB: attempts `source='practice'`, `progress` ไม่เปลี่ยน, `activity_days` วันนี้มีแถว | `LessonPlayer.test.tsx`, `page.test.tsx` (day), `practice-guard.int.test.ts`, `e2e/replay.spec.ts` |
| `/day/N?skill=S` เล่นซ้ำทีละทักษะ | `/day/1?skill=reading` หลังจบวันที่ 1 | "ข้อ 1 / 1" ของส่วนอ่าน; หน้าจบมี "ฝึกแยกส่วนไม่นับสตรีค นับเมื่อเล่นทั้งบทจนจบ"; `?skill=vocabulary` → 404; ยังไม่จบ → "ฝึกแยกส่วนได้หลังเรียนบทนี้จบ" | เหมือนแถวบน |
| `POST /api/practice/complete` | `{"kind":"replay","day":1,"skill":null,"sessionId":"<uuid>","completedAt":"<ISO>"}` | 200 `{session:{score,graded}, lessonScore, streak, countedForStreak}`; เรียกซ้ำได้ผลเดิม; 409 `not_replayable`; ไม่มีการเปลี่ยนแถว `progress`/`profiles` | `practice-complete-handler.int.test.ts`, `practice-guard.int.test.ts`, `routes.test.ts` |
| `POST /api/attempts` (`source: practice`) | item `source:"practice"` | วันที่ done → `created`; ยังไม่ done → `rejected` `not_finished` | `attempts-handler.int.test.ts` |

## 6. ไม่ทำในงานนี้ (ขอบเขต)
- ชุดฝึก 10 ข้อ, ทวนคำศัพท์ (SRS), บทพัฒนาจุดอ่อน, การ์ด "แนะนำสำหรับคุณ" ในภาพ 06 (สัญญาเตรียม `kind` ไว้ให้ต่อยอด)
- ประวัติ/คะแนนดีที่สุดของการเล่นซ้ำในรายการ, จำนวนครั้งที่เล่นซ้ำ
- แถว "วันนี้"/"ล็อก" และการจัดกลุ่ม "สัปดาห์ที่ N" ของภาพ 28
- เปิดหน้าเล่นซ้ำขณะออฟไลน์ (service worker/IndexedDB), จำตำแหน่งข้อเมื่อรีโหลด
- เปลี่ยนพฤติกรรม `touchesProgress` ของ `drill`/`retest`/`checkpoint`
- ปฏิเสธ attempt `lesson` ของวันที่ done (ข้อ 16)

## 7. ต้องให้ผู้ใช้ยืนยัน
| # | สิ่งที่สมมติ | แนะนำ | เปลี่ยนภายหลังอย่างไร |
|---|---|---|---|
| 7.1 | เล่นซ้ำ **ทีละทักษะไม่นับสตรีค** (ส่วนหนึ่งมี 1–4 ข้อ ไม่ใช่ "ชุด 10 ข้อ" หรือ "ทั้งบท") | ไม่นับ | เงื่อนไขเดียวใน `practice-complete-handler.ts` (`skill === null`) + ข้อความหน้าจบ/หน้า `/practice` |
| 7.2 | คงรอบทวนข้อที่ผิดท้ายบทในการเล่นซ้ำ | คงไว้ | flag ตอนสร้าง player state |
| 7.3 | เปิด `/day/N` ของวันที่จบแล้ว = เล่นซ้ำ (ไม่มีโหมดเรียนครั้งแรกซ้ำอีก) URL เป็น `/day/N?skill=` ไม่ใช่ `/replay/N` | ตามนี้ | ถ้าอยากได้ URL แยก ต้องแก้ `router.refresh()` หลังจบบทก่อน (ข้อ 2) |
| 7.4 | รายการแสดงเฉพาะวันที่จบแล้ว ใหม่สุดก่อน ไม่แบ่งสัปดาห์ ไม่มีแถว "วันนี้"/"ล็อก" (ภาพ 28 มี) | ตามนี้ | แก้เฉพาะ `practice/page.tsx` |
| 7.5 | ปุ่มต่อทักษะอยู่ในแถวที่กางออก (`<details>`) แทนหน้าเลือกแยก | `<details>` | ย้ายเป็นหน้าเลือกต้องแก้ `layout.test.tsx` ที่บังคับ 4 หน้า |
| 7.6 | หน้าจบแสดงคะแนนรอบนี้ + คะแนนเดิม ปุ่ม "เล่นอีกครั้ง" / "กลับไปหน้าฝึกเพิ่ม" / "กลับหน้าแรก" ไม่มี "ไปบทถัดไป" | ตามนี้ | แก้ `PracticeCompletionScreen.tsx` |
| 7.7 | ส่วนที่ประเมินตัวเองล้วน (ส่วนพูด) เล่นซ้ำได้ แสดง "ส่วนนี้ประเมินตัวเอง ไม่มีคะแนน" | ตามนี้ | ข้อความในหน้าจบ |
| 7.8 | เล่นทั้งบทจนจบนับสตรีคแม้ทุกข้อถูก "ข้าม" (เครื่องไม่มีเสียง) และไม่ตรวจว่าตอบครบทุกข้อ | ยอมรับ (ผู้ใช้คนเดียว) | เพิ่มเงื่อนไข "มี attempt ≥ 1" ใน handler |
| 7.9 | เวลาฝึก (`duration_ms`) ของ practice นับใน "เวลาฝึกรวมต่อสัปดาห์" (PROGRESS §5) เมื่อทำหน้าพัฒนาการ | นับ | ตั้งค่าใน `SOURCE_ROLES` |
| 7.10 | ข้อความใต้หัวหน้า `/practice`: "เล่นบทที่เรียนจบแล้วซ้ำได้ไม่จำกัด คะแนนเดิมของบทไม่เปลี่ยน เล่นทั้งบทจนจบนับสตรีค" (ภาพ 28 เขียนว่า "นับสตรีค" เฉยๆ ซึ่งจะไม่จริงถ้า 7.1 = ไม่นับ) | ตามนี้ | ข้อความในหน้า |

## 8. ความเสี่ยง
- **R1 refresh หลังจบบท:** ถ้าใครใส่ `mode` ใน `key` หรืออ่าน `mode` จาก props ทุก render หน้าจบของการเรียนครั้งแรกจะกลายเป็นหน้าจบของการเล่นซ้ำ/หายไป กันด้วยเทสต์ guard ใน PR 3a
- **R2 สองแท็บ:** แท็บ A จบวันที่ N, แท็บ B (เปิดไว้ก่อน) ยังเป็นโหมด lesson ส่ง attempt `lesson` ของวันที่ done: คะแนนไม่เปลี่ยนในกรณีปกติ (ข้อ 1.3) แต่นับเป็นหลักฐานจุดอ่อน ยอมรับ (ผู้ใช้คนเดียว พบได้ยาก)
- **R3 `layout.test.tsx` ของ `(main)`** render ทุกหน้าในกลุ่มด้วย mock: หน้า `/practice` ที่อ่าน DB ต้องมี mock เพิ่ม ไม่งั้นเทสต์ล้ม (คาดไว้ใน PR 3b)
- **R4 การนับสตรีคไม่ตรวจความครบ** (ข้อ 23, 7.8)
- **R5 คะแนนในเครื่องต่างจาก server** เมื่อบาง attempt ถูก `rejected`: หน้าจบใช้ค่าจาก server เมื่อ `done` แล้วเสมอ
- **R6 migration** เปลี่ยน CHECK: ปลอดภัยกับข้อมูลเดิม แต่ผู้ตรวจต้องอ่าน SQL ที่ generate ก่อน merge (ไม่มี `DROP TABLE`/`DROP COLUMN`)
- **R7 E2E ไม่นิ่ง** (`docs/PLAN.md:71`): เลี่ยงข้อเสียงใน E2E ใหม่ ห้ามแก้ด้วย retry
