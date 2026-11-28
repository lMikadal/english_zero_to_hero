# แผน: แบบทดสอบประจำเดือน (monthly checkpoint)

สถานะ: แผนของ architect (2026-11-28) ผู้ใช้อนุมัติการตัดสินใจแล้ว เริ่มทำตามลำดับ PR ในข้อ 5 อ่านคู่กับ `docs/ARCHITECTURE.md` §4/§5/§5.1, `docs/PROGRESS.md` §1/§3/§4/§5, `docs/CONTENT_SCHEMA.md`, `docs/plans/replay-plan.md` (รูปแบบและกลไกที่แผนนี้ใช้ซ้ำ)

ที่เก็บ: รากของ repo นี้ (path ในเอกสารนี้นับจากรากของ repo)

คำที่ใช้: **A** = `afterDay` ของแบบทดสอบ (30, 60, … 360), **ครั้งที่ k** = A / 30, **รอบสอบ (sitting)** = การทำแบบทดสอบหนึ่งรอบ = `sessionId` หนึ่งค่า

## 0. ตัดสินแล้ว และสิ่งที่ผู้ใช้ต้องตัดสิน

### 0.1 ตัดสินแล้ว (ห้ามเปิดใหม่)

| # | การตัดสินใจ | ที่มา |
|---|---|---|
| U1 | แบบทดสอบเป็นของแยกจากบทเรียนรายวัน เนื้อหาอยู่ใน `content/checkpoints/` ทำหลังจบวันที่ 30 (แล้ว 60, 90 …) วันที่ 30 เป็นบทเรียนปกติ | ผู้ใช้ 2026-11-28 |
| U2 | ข้อพูดประเมินตัวเองและ `free_write` มี `score = null` และไม่นับเป็นคะแนนที่ใดเลย | `docs/plans/m1-lesson-player-decisions.md` ข้อ 1 |
| U3 | คะแนนทุกค่าเป็นเศษส่วน 0..1 | เดิม ข้อ 6 |
| U4 | บทเรียนล็อกตามลำดับ (`day <= profiles.current_day`) | เดิม ข้อ 3 |
| U5 | ข้อมูลที่ client เขียนต้องผ่านคิวที่มี id กันบันทึกซ้ำ | `CLAUDE.md` |

### 0.2 การตัดสินใจของผู้ใช้ (ผู้ใช้อนุมัติค่าที่แนะนำทุกข้อ D1–D16 เมื่อ 2026-11-28: "เอาตามแนะนำ")

คอลัมน์ "แนะนำ" ด้านล่างคือสิ่งที่ตัดสินแล้ว ถ้าจะเปลี่ยนต้องถามผู้ใช้ก่อน

| # | เรื่อง | แนะนำ | เหตุผล | เปลี่ยนภายหลังอย่างไร |
|---|---|---|---|---|
| D1 | วันที่ A+1 ล็อกหรือไม่ | **ล็อกจนกว่าจะ "สอบจบหนึ่งรอบ" ไม่ว่าได้กี่คะแนน** (ไม่ต้องผ่าน) | ตรงกับ "ล็อกตามลำดับ" และผู้เรียนไม่มีทางค้าง เพราะสอบจบได้เสมอ ถ้าบังคับให้ผ่าน คนที่ได้ 65% ซ้ำๆ จะเรียนต่อไม่ได้ | ฟังก์ชันเดียว `blockingCheckpoint()` (ข้อ 4.4) ล็อกคำนวณสด ไม่มีข้อมูลค้างในฐานข้อมูล |
| D2 | เกณฑ์ผ่าน | คะแนนรวม (ถ่วงน้ำหนักตามทักษะ) ≥ **70%** = `CHECKPOINT_PASS_SCORE` ที่มีอยู่ใน `src/lib/progress/config.ts`; ทักษะที่ได้ < 70% ถูกติดป้าย "ควรฝึกซ่อม" แม้คะแนนรวมผ่าน | ใช้ตัวเลขเดียวกับ PROGRESS §4 ไม่เพิ่มเกณฑ์ใหม่ | ค่าคงที่ใน `config.ts` |
| D3 | "ไม่ผ่าน" ทำให้เกิดอะไร | **ฝึกซ่อมแบบแนะนำ ไม่บังคับ:** หน้าผลแสดงทักษะที่ควรซ่อม พร้อมลิงก์เล่นซ้ำส่วนทักษะนั้นของวันที่กำหนดในไฟล์ (`reviewDays`, ปกติคือวันทบทวนประจำสัปดาห์ 13/20/27) ผ่านกลไกเล่นซ้ำเดิม (`/day/N?skill=S`) แล้วชวนสอบใหม่ ไม่มีเนื้อหาซ่อมใหม่ | บทพัฒนาจุดอ่อน (drill/retest) ยังไม่มี; เล่นซ้ำมีแล้วและไม่กระทบคะแนนบท | ข้อ 6 |
| D4 | สอบซ้ำ | ไม่จำกัดจำนวน แต่ **เริ่มรอบใหม่ได้ตั้งแต่วันปฏิทินถัดไป** (ตามเขตเวลาผู้ใช้); สถานะ "ผ่าน" เมื่อมีรอบใดรอบหนึ่งผ่าน; แสดงคะแนนล่าสุดและคะแนนดีที่สุด | กันจำเฉลยสดๆ (แนวเดียวกับ "ทดสอบซ้ำอีกวัน" ใน PROGRESS §3.1) | เงื่อนไขในหน้า `/checkpoint/[n]` |
| D5 | เฉลยระหว่างสอบ | **ไม่แสดงถูก/ผิดและไม่เฉลยระหว่างทำ** แสดงผลรวมและรายทักษะตอนจบ; v1 ไม่มีหน้าทบทวนรายข้อ; ไม่มีรอบทวนข้อที่ผิด; ปุ่มในข้อเปลี่ยนเป็น "ยืนยันคำตอบ" | เป็นการวัดผล และข้อชุดเดิมถูกใช้ตอนสอบซ้ำ | ถ้าเลือก "เฉลยทันทีเหมือนบทเรียน" ตัด PR 4 ทิ้งได้ทั้ง PR |
| D6 | ข้อพูด/เขียนที่ประเมินตัวเอง | **ส่วนพูดอยู่ในแบบทดสอบแต่ไม่นับคะแนน** (น้ำหนัก 0) หน้าผลแสดงแยก "พูด: ประเมินตัวเอง พูดได้ 3 จาก 4 ข้อ · ไม่นับคะแนน"; ส่วนเขียนใช้เฉพาะชนิดที่ตรวจอัตโนมัติ; **ห้าม `free_write`** ในแบบทดสอบ | U2; คะแนนที่ปลดล็อกบทและใช้ประเมิน CEFR ต้องไม่ขึ้นกับปุ่ม "พูดได้" | เมื่อมี Azure scoring / AI ตรวจงานเขียน: ให้น้ำหนัก > 0 ในไฟล์เนื้อหา (ตัวตรวจคุม) |
| D7 | สตรีค | **สอบจบหนึ่งรอบ (รอบแรกหรือสอบซ้ำ) นับเป็นกิจกรรมของวันนั้น** แม้วันนั้นไม่ได้เรียนบท; ทำไม่จบไม่นับ | 30 นาทีของงานจริง เทียบได้กับจบบท; ทำนองเดียวกับเล่นซ้ำทั้งบท | เงื่อนไขเดียวใน `checkpoint-complete-handler.ts` |
| D8 | ปิดแอปกลางคัน | **ทำต่อจากข้อที่ค้างได้ภายใน 24 ชั่วโมง** นับจากคำตอบแรกของรอบ (คำตอบที่ส่งถึง server แล้วเท่านั้น); เกินนั้นเริ่มรอบใหม่ | แบบทดสอบยาว 30 นาที; ตัวเล่นบทเรียนเริ่มใหม่ทุกครั้งที่โหลดหน้า (ปัญหาเดิมใน PLAN) จะใช้กับแบบทดสอบไม่ได้ | ค่าคงที่ `CHECKPOINT_RESUME_HOURS` |
| D9 | จับเวลา | ไม่จับเวลา ไม่มีเวลาหมด | ผู้เรียนระดับเริ่มต้น | - |
| D10 | ทางเข้า | (1) หน้าแรก: เมื่อแบบทดสอบกั้นอยู่ การ์ดหลักเปลี่ยนเป็น "แบบทดสอบประจำเดือน ครั้งที่ k" ปุ่มหลักปุ่มเดียว "เริ่มแบบทดสอบ" (2) หน้าจบบทวันที่ A: ปุ่มหลัก "ไปทำแบบทดสอบ" แทน "ไปบทถัดไป" (3) `/today` พาไปแบบทดสอบ (4) `/practice`: การ์ด "แบบทดสอบประจำเดือน" แสดงทุกครั้งที่เปิดแล้วพร้อมสถานะ | ปุ่มหลักปุ่มเดียวต่อหน้า (กติกาเดิมของหน้าแรก) | แต่ละจุดอยู่คนละไฟล์ |
| D11 | คำตอบแบบทดสอบกับ "จุดอ่อน" | **นับเป็นหลักฐานเฉพาะครั้งแรกที่ผู้เรียนตอบข้อนั้น** (ตลอดชีวิตของข้อ) คำตอบครั้งต่อไปของข้อเดิม (สอบซ้ำ, รอบที่ทิ้งแล้วเริ่มใหม่) เก็บเป็น `checkpoint_retake` ไม่นับ | ข้อชุดเดิมถูกถามซ้ำ ถ้านับทุกรอบ การสอบซ้ำจะทำให้จุดอ่อนดูหายหรือแย่เกินจริง (เหตุผลเดียวกับ `practice`) | ตาราง `SOURCE_ROLES` |
| D12 | ข้อที่ไม่ได้ตอบ | ข้อที่นับคะแนนแต่ไม่มีคำตอบ (กด "ข้าม" เพราะเครื่องไม่มีเสียง, ถูก server ปฏิเสธ) = **0 คะแนน**; หน้าเริ่มสอบเตือนถ้าเครื่องไม่มีเสียงอังกฤษ | คะแนนต้องมีตัวหารคงที่จากเนื้อหา ไม่ใช่จากจำนวนที่ตอบ | `scoreCheckpoint()` |
| D13 | น้ำหนักครั้งที่ 1 | ออกเสียง 20 · ฟัง 25 · พูด 0 · อ่าน 20 · เขียน 35 | เฟส 1 เน้นเสียงและการฟัง; เขียนมีข้อมากสุดและรวมคำศัพท์/ไวยากรณ์ | ตัวเลขในไฟล์เนื้อหา |
| D14 | คะแนน "คำศัพท์" แยก | **ไม่มีใน v1** ข้อ `vocab_match` อยู่ในส่วนเขียน | ความรู้คำศัพท์วัดด้วย SRS อยู่แล้ว (PROGRESS §2) ไม่ทำตัวเลขที่สองที่ขัดกัน | เพิ่มทักษะที่หกใน schema ภายหลัง |
| D15 | ผู้เรียนที่เลยวัน A+1 ไปแล้วตอนฟีเจอร์ออก | **ไม่ถูกล็อกย้อนหลัง** แบบทดสอบขึ้นเป็นตัวเลือกใน `/practice` และแถวรองบนหน้าแรก | ห้ามค้าง | เงื่อนไข `nextDayStarted` ใน gate |
| D16 | ชื่อบนจอ | "แบบทดสอบประจำเดือน ครั้งที่ k" · "ผ่าน" / "ยังไม่ผ่าน" · "ควรฝึกซ่อม" · "สอบอีกครั้ง" | - | ข้อความ |

## 1. ข้อเท็จจริงจากโค้ดตอนนี้

1. ไม่มีบทไหนใช้ `type: "checkpoint"` (วัน 1–35: lesson 25, review 5, challenge 5) ค่านี้มีใน `LESSON_TYPES` (`src/lib/content/schema.ts:8`) และกฎ `day % 30` ที่ `src/lib/content/validate.ts:139` เท่านั้น
2. ไม่มีโฟลเดอร์ `content/checkpoints/`; `readContent` (`src/lib/content/loader.ts`) อ่านเฉพาะ `lessons/` และ `vocab/`; image prod คัดลอก `content/` ทั้งโฟลเดอร์ (`Dockerfile:56`) จึงไม่ต้องแก้ Docker
3. `attempts.source` มี `checkpoint` อยู่แล้ว (`src/db/schema.ts`, CHECK `attempts_source_valid`) และ `SOURCE_ROLES.checkpoint = { detection: true, drillActivity: false, touchesProgress: true }` (`src/lib/progress/sources.ts`) แต่ไม่มีโค้ดใดส่งค่านี้
4. `POST /api/attempts` หา exercise จาก `dayOf(exerciseId)` = ตัวเลขใน `dXXX` แล้ว `getLesson(day)` (`src/lib/server/attempts-handler.ts:19,62-64`); `EXERCISE_ID_PATTERN` รับเฉพาะ `d` (`schema.ts:23`, ใช้ใน `src/lib/attempts/contract.ts:13`)
5. `deriveTags` ใช้ `phoneme_intro` ของบทเดียวกันเป็นค่าตั้งต้นของแท็กเสียง (`src/lib/attempts/derive.ts:81-83`) แบบทดสอบไม่มี `phoneme_intro` จึงต้องมี `phonemes` ทุกข้อเสียง
6. `estimateCefr` ถือว่า "ผ่านสอบ" = แถว `progress` ของวัน 60/150/270/360 ที่ `score ≥ 0.7` (`src/lib/progress/cefr.ts:28`) หลัง U1 วันเหล่านี้เป็นบทเรียนปกติ สูตรนี้จึงผิด ต้องเปลี่ยนไปอ่านผลแบบทดสอบ (ยังไม่มีหน้าจอใดเรียก `estimateCefr`)
7. ตัวเล่น (`src/components/player/LessonPlayer.tsx`) มีสองโหมด (`lesson`/`practice`) เริ่มใหม่ทุกครั้งที่ mount (`sessionId` ใหม่) ไม่มีการทำต่อ; component ของทุกข้อล็อกตัวเองหลังส่งคำตอบด้วย state ของตัวเอง (`sent`/`submitted`/`chosen`) แต่เมื่อได้ `result` จะไฮไลต์ถูก/ผิดและเฉลยเสมอ
8. คิว (`src/lib/offline/http-sink.ts`) อยู่ในหน่วยความจำ; รายการจบ (`CompleteEntry`) ใช้ `url` + ตัวตรวจ response ต่อชนิด จึงเพิ่มชนิดใหม่ได้โดยไม่แก้กติกาคิว; `isCompleteResponse` ตรวจแค่ว่ามี `progress`/`streak`/`currentDay` จึงรับฟิลด์เพิ่มได้
9. กฎเนื้อหา (`src/lib/content/rules/*.ts`) วน `ctx.lessons` และใช้ `lesson.day` เป็น "วันที่ผู้เรียนรู้ถึง" (`taught-words.ts`, `grammar-not-yet.ts`)
10. E2E รันตามลำดับชื่อไฟล์ ใช้ผู้เรียนคนเดียวและฐานข้อมูลเดียว (`playwright.config.ts` worker เดียว); `lesson.spec.ts` ต้องการฐานข้อมูลที่ยังไม่จบบทใด

## 2. รูปแบบที่เลือก

- **เนื้อหา:** หนึ่งไฟล์ต่อหนึ่งครั้ง `content/checkpoints/checkpoint-030.json` ใช้ exercise type เดิมทั้งหมด (ไม่มี type ใหม่) ID เป็น `c030-<skill>-NN`
- **ที่เก็บคำตอบ:** ตาราง `attempts` เดิม ผ่าน `POST /api/attempts` เดิม (`day` = A, `source` = `checkpoint` หรือ `checkpoint_retake` ที่ **server เป็นคนตัดสิน**)
- **ที่เก็บผล:** ตารางใหม่ `checkpoint_results` หนึ่งแถวต่อรอบสอบที่จบ (id = `sessionId` ของ client จึงกันซ้ำได้) เขียนโดย endpoint ใหม่ `POST /api/checkpoints/complete`
  - ทำไมมีตาราง ทั้งที่แผนเล่นซ้ำไม่มี: ต้องมี "เหตุการณ์จบ" ที่ใช้ปลดล็อกวันถัดไป ใช้ประเมิน CEFR และเป็นประวัติให้หน้าพัฒนาการ; คะแนนถูกตรึง ณ ตอนจบ (เหมือน `progress.score`) เพื่อไม่ให้การแก้ไฟล์ข้อสอบภายหลังเปลี่ยนผลเก่า
- **ล็อก:** คำนวณสดจาก (ไฟล์แบบทดสอบมี) ∧ (ยังไม่มีผล) ∧ (ยังไม่เริ่มวัน A+1) **ไม่แก้ `profiles.current_day`** แบบทดสอบจึงไม่เขียน `progress`/`profiles` เลย (บังคับด้วย ESLint เหมือน `practice-*`)
  - ทางเลือกที่ไม่เลือก: ไม่เลื่อน `current_day` ตอนจบวัน A แล้วให้แบบทดสอบเป็นคนเลื่อน โค้ดน้อยกว่า แต่ถ้าไฟล์แบบทดสอบหายหรือเสียภายหลัง ผู้เรียนจะค้างที่วัน A ถาวร และการเปลี่ยนใจเรื่อง D1 ต้องแก้ข้อมูล
- **หน้าจอ:** route ใหม่ `/checkpoint/[n]` ใต้ `src/app/(learn)/` (ไม่มีเมนูหลัก ได้ `SpeechAudioProvider` จาก layout เดิม) หน้าเดียวมี 3 สถานะ: เริ่ม/ผลล่าสุด → ทำข้อสอบ → ผล
  - ไม่ใช้ `/day/N` เพราะแบบทดสอบไม่ใช่วัน และ `/day/30` ที่ done ต้องยังเป็น "เล่นซ้ำบทวันที่ 30"
- **ตัวเล่น:** component ใหม่ `CheckpointPlayer` ในโฟลเดอร์ `src/components/checkpoint/` ใช้ `player-state.ts`, `registry.tsx` และโครงหน้า (หัว + แถบล่าง) ที่แยกออกจาก `LessonPlayer` ไม่เพิ่มโหมดที่สามใน `LessonPlayer` (สองโหมดก็มี 4 จุดที่แตกกิ่งแล้ว)
- **"สวิตช์" ของฟีเจอร์คือไฟล์เนื้อหา:** ไม่มีไฟล์ = ไม่มีล็อก ไม่มีทางเข้า PR เนื้อหา (PR 7) จึง merge หลัง UI ครบ

## 3. กติกาพฤติกรรม

### 3.1 เนื้อหาและตัวตรวจ (รายละเอียด schema ที่ข้อ 4.1)
1. ไฟล์: `content/checkpoints/checkpoint-XXX.json` (XXX = A สามหลัก); A ∈ {30, 60, … 360}; โฟลเดอร์ไม่มีก็ได้ (ไม่ใช่ error)
2. ID: `cXXX-<skill>-NN` (`<skill>` ชุดเดิม) XXX = A; ไม่ซ้ำกับ ID ใดใน repo (ใช้แผนที่เดียวกับบทเรียนใน `checkContent`); `d…` ในไฟล์แบบทดสอบ หรือ `c…` ในไฟล์บทเรียน = error
3. หนึ่งทักษะมีได้หนึ่งส่วน; `weight` รวมทุกส่วน = 100
4. ส่วนที่ `weight > 0`: ทุกข้อเป็นชนิดตรวจอัตโนมัติ (`isRetryable(type)` ใน `src/lib/answers/grade.ts`: `minimal_pair`, `listen_choose`, `dictation`, `read_passage`, `arrange_words`, `fill_blank`, `translate_th_en`, `vocab_match`) และมีอย่างน้อย 3 ข้อ; ส่วนที่ `weight = 0`: ทุกข้อเป็นชนิดประเมินตัวเอง (`repeat_after_me`, `shadowing`, `speak_answer`) ห้ามปนกัน
5. ห้ามทุกที่: `phoneme_intro`, `free_write`, `roleplay`, `spell_word`, `use_in_sentence`
6. **"เฉพาะเนื้อหาวัน 1–A" บังคับด้วยกฎเดิม:** ตัวตรวจมองแบบทดสอบเป็นหน่วยข้อความของ "วัน A" แล้วรัน `taught-words` (คำต้องสอนภายในวัน A หรืออยู่ใน allowlist), `grammar-not-yet` (เช่น `has` ได้เพราะ 29 ≤ 30; -s บุรุษที่สาม, `do not` ไม่ได้เพราะ 36 > 30), `pronunciation`, `sound-words`, `arrange-words`, `arrange-question`, `answer-forms`, `thai-names` **ไม่รัน** `cast-consistency`/`cast-props` (แบบทดสอบข้ามหลายสัปดาห์) และ `vocab-used`
7. **ไม่มีคำใหม่:** ไม่มีช่อง `vocab`; `read_passage` ในแบบทดสอบ **ห้ามมี `glossary`** (ช่องทางเดียวที่กฎเดิมยอมให้ใช้คำที่ยังไม่สอน); `vocab_match` อ้างได้เฉพาะคำที่สอนในวัน ≤ A
8. ทุก `minimal_pair` และทุกข้อในส่วน `pronunciation` ต้องมี `phonemes`; ทุกรหัสต้องเคยปรากฏในบทวัน ≤ A (เป็น `phoneme_intro.phoneme` หรือใน `phonemes`) กันพิมพ์ผิด
9. `reviewDays` (1–4 วันต่อส่วน): ทุกวัน ≤ A, มีไฟล์บท และบทนั้นมีส่วนของทักษะเดียวกัน (ลิงก์ฝึกซ่อมจึงไม่มีวันพัง)
10. ต้องมี `content/lessons/day-<A>.json` (ไม่งั้นไม่มีทางปลดล็อกแบบทดสอบ)
11. คำเตือน (warning): เสียงที่ `phoneme_intro` สอนในวัน A−29..A แต่ไม่มีข้อไหนของแบบทดสอบติดแท็ก; ข้อที่ข้อความหลัก (`audioText`, `text`, `answer`, `th`) ซ้ำตรงตัวกับข้อในบทวัน ≤ A (ข้อสอบควรเป็นประโยคใหม่จากคำเดิม); `estimatedMinutes` นอก 20–45
12. `type: "checkpoint"` ของบทเรียนถูกลบออกจาก `LESSON_TYPES` พร้อมกฎ `day % 30` (ไม่มีไฟล์ใดใช้ จึงไม่ต้องย้ายข้อมูล)

### 3.2 การเข้าถึงและการล็อก
13. แบบทดสอบ A **เปิด** เมื่อมีไฟล์ที่โหลดได้ และ `progress` วัน A = `done`
14. แบบทดสอบ A **กั้น** วัน A+1 เมื่อ: เปิดอยู่ ∧ ไม่มีแถว `checkpoint_results` ของ A ∧ `profiles.current_day = A+1` ∧ ยังไม่มีแถว `progress` ของวัน A+1 (ข้อสุดท้ายคือ D15) ขณะกั้น วันที่เล่นได้สูงสุดคือ A (`playableDay = current_day − 1`); วัน ≤ A เล่นซ้ำได้ตามปกติ
15. จุดที่ใช้ `playableDay` แทน `current_day`: หน้า `/day/[day]`, `POST /api/attempts` (รายการ `d…`), `POST /api/lessons/complete` (ทั้งสองตอบ `locked_day` เหมือนเดิม), หน้าแรก, `/today`
16. ไฟล์แบบทดสอบหาย/เสีย = ไม่กั้น (log error) ผู้เรียนเรียนต่อได้
17. หน้า `/checkpoint/[n]` ลำดับตรวจ: รูปแบบ n ผิด (ไม่ใช่ 30..360 ที่หาร 30 ลงตัวแบบ canonical) → 404 → DB error → ไม่มีไฟล์ → "ยังไม่มีแบบทดสอบนี้" → วัน n ยังไม่ done → "ยังไม่ปลดล็อก เรียนถึงวันที่ n ให้จบก่อน" + ลิงก์ `/today` → แสดงแอปแบบทดสอบ

### 3.3 การทำข้อสอบ
18. หน้าเริ่ม: ชื่อ, "วันที่ 1–A", จำนวนข้อ, เวลาโดยประมาณ, กติกา 4 บรรทัด (ไม่เฉลยระหว่างทำ, ทำทีละข้อย้อนไม่ได้, ส่วนพูดไม่นับคะแนน, ปิดแล้วกลับมาทำต่อได้ภายใน 24 ชม.), คำเตือนถ้าเครื่องไม่มีเสียงอังกฤษ, ปุ่ม "เริ่มแบบทดสอบ" (หรือ "ทำต่อ (ข้อ x / n)" เมื่อมีรอบค้าง)
19. เรียงตามส่วนในไฟล์ ทีละข้อ ไม่มีรอบทวน; ทุก attempt: `source: "checkpoint"`, `attemptNo: 1`, `sessionId` ของรอบ
20. หลังยืนยันคำตอบ: ข้อถูกล็อก แถบล่างขึ้น "บันทึกคำตอบแล้ว" + "ถัดไป" ไม่มีถูก/ผิด ไม่มีเฉลย ไม่มี `data-state` right/wrong ใน DOM (D5)
21. ข้อเสียงเมื่อเครื่องไม่มีเสียง: ปุ่ม "ข้าม" เดิม ไม่บันทึก attempt = 0 คะแนน (D12)
22. ทำต่อ (D8): server หา "รอบค้าง" = `session_id` ล่าสุดของ attempt แบบทดสอบ A ที่ยังไม่มีแถวผล และ attempt แรกของรอบอยู่ภายใน 24 ชม. ส่ง `sessionId` + รายการ `exerciseId` ที่ตอบแล้วให้ client ตัวเล่นข้ามข้อเหล่านั้นและใช้ `sessionId` เดิม ตัวนับ "ข้อ x / n" นับจากทั้งชุด
23. สอบซ้ำ (D4): ถ้ารอบที่จบล่าสุดมีวันท้องถิ่นของ `completed_at` = วันนี้ หน้าแสดงผลรอบนั้นและ "สอบอีกครั้งได้ตั้งแต่พรุ่งนี้" ไม่มีปุ่มเริ่ม (บังคับที่หน้าเท่านั้น server ไม่ปฏิเสธ: เป็นคำแนะนำการเรียน ไม่ใช่ความปลอดภัย)

### 3.4 server: attempt ของแบบทดสอบ (`POST /api/attempts`)
24. `c…` → โหลดแบบทดสอบ A แทนบทเรียน; ไม่มีไฟล์/ไม่มีข้อ → `unknown_exercise`; `attempts.day` = A; `skill` = `attemptSkill(section, ex)` เดิม; `tags` = `deriveTags` เดิมกับคำที่สอนถึงวัน A (`getTaughtWords(A)`)
25. `c…` ต้องมากับ `source` `checkpoint` หรือ `checkpoint_retake`; `d…` ห้ามใช้สองค่านี้; `attemptNo` ต้องเป็น 1 → ผิด = `rejected` `invalid`
26. `locked_day` ถ้า A > `playableDay` (เช็กเดิม); `not_finished` ถ้าวัน A ยังไม่ done (ได้จากการตั้ง `touchesProgress: false` ให้ทั้งสอง source: กิ่งเดิมที่ใช้กับ `practice`)
27. **server ตัดสิน source ที่เก็บ (D11):** ถ้าผู้เรียนมี attempt ของ `exercise_id` นี้อยู่แล้ว (id อื่น) → เก็บ `checkpoint_retake` ไม่งั้น `checkpoint` ไม่ว่า client ส่งค่าไหนในสองค่านั้น
28. ไม่แตะ `progress` (ไม่เข้า `firstCreated`); คะแนนบทวัน A ไม่เปลี่ยน (`computeLessonScore` กรอง `source = 'lesson'` อยู่แล้ว)

### 3.5 server: จบรอบสอบ (`POST /api/checkpoints/complete`)
29. body ผิด → 400; ไม่มีไฟล์, วัน A ยังไม่ done, หรือรอบนี้ไม่มี attempt ที่เก็บไว้เลย → 409 `{error:"not_completable"}` (ข้อสุดท้ายกันคำขอเปล่าปลดล็อกวันถัดไป; คิวส่ง attempt ก่อนเสมอ)
30. คะแนน = `scoreCheckpoint(checkpoint, rows)` (ข้อ 4.5) จาก attempt ของ `session_id` นี้, `day = A`, source สองค่า, `attempt_no = 1`, ข้อที่อยู่ในไฟล์; ต่อข้อใช้แถวที่ **เก่าสุด** (ตอบซ้ำเพื่อแก้ไม่ได้)
31. `INSERT checkpoint_results … ON CONFLICT (id) DO NOTHING`; มีอยู่แล้ว → คืนผลที่เก็บไว้ ไม่คำนวณใหม่ (เรียกซ้ำได้ผลเดิม)
32. `completed_at` = `completedAt` ของ client ตัดเข้า `[floor, now]` แล้วยกขึ้นอย่างน้อยเท่า attempt ล่าสุดของรอบ; `started_at` = attempt แรกของรอบ
33. สตรีค (D7): `touchStreak(tx, userId, localDate(completed_at, tz), "checkpoint")` ทุกครั้งที่ได้ 200 (วันที่มีกิจกรรมแล้วไม่เพิ่มแถว)
34. ไม่เขียน `progress`, `profiles`, `attempts`, `srs_*` (ไฟล์ `checkpoint-*.ts` ใน `src/lib/server/` import ตัวเขียนเหล่านั้นไม่ได้)
35. response มี `nextDay`: วัน A+1 ถ้ามีไฟล์บทและตอนนี้เล่นได้ ไม่งั้น `null`

### 3.6 หน้าผล
36. h1 "ผลแบบทดสอบ ครั้งที่ k"; ป้าย "ผ่าน" (≥ 70%) หรือ "ยังไม่ผ่าน" (สื่อด้วยข้อความ + ไอคอน ไม่ใช่สีอย่างเดียว); "คะแนนรวม N%" + "เกณฑ์ผ่าน 70%"
37. รายทักษะ: แถวละทักษะ ชื่อไทย (`REPLAY_SKILL_LABEL_TH`), แถบ, "N% · ตอบ a จาก t ข้อ"; ส่วนพูด: "ประเมินตัวเอง พูดได้ a จาก t ข้อ · ไม่นับคะแนน"
38. ทักษะที่ < 70%: หัวข้อ "ควรฝึกซ่อม" ต่อทักษะมีลิงก์ "<ทักษะ> · วันที่ N" → `replayHref(N, skill)` ตาม `reviewDays`; ลิงก์ที่เล่นซ้ำแล้วหลังรอบสอบนี้มี ✓ "ฝึกแล้ว" (มี attempt `practice` ของข้อในส่วนนั้นที่ `created_at >` `completed_at` ของผล); ไม่มีทักษะต่ำกว่าเกณฑ์: ไม่แสดงหัวข้อนี้
39. "สตรีค X วัน (นานที่สุด Y วัน)"; ถ้ามีมากกว่าหนึ่งรอบ: "รอบที่ m · ดีที่สุด B%"
40. ปุ่ม: `nextDay` ไม่ null → ปุ่มหลัก "ไปบทเรียนวันที่ N" → `/day/N`; ไม่งั้นปุ่มหลัก "กลับหน้าแรก"; บรรทัด "สอบอีกครั้งได้ตั้งแต่พรุ่งนี้" (ไม่ใช่ปุ่ม)
41. `queued`: "จะแสดงผลเมื่อออนไลน์" (ไม่มีคะแนนในเครื่อง เพราะรอบที่ทำต่อไม่มีคำตอบเก่าในเครื่อง) แล้วเปลี่ยนเป็นผลจริงเมื่อคิวว่าง (กลไกเดียวกับ `LessonPlayer.tsx` ช่วง `queued`); `rejected` 409: "บันทึกผลไม่ได้ ไม่มีคำตอบของรอบนี้บน server ลองทำใหม่"; `error`: "ลองอีกครั้ง"

### 3.7 ออฟไลน์ / คิว
42. เปิดหน้าขณะออฟไลน์ยังไม่ได้ (ยังไม่มี service worker เหมือนบทเรียน); ออฟไลน์ระหว่างทำ: attempt และรายการจบเข้าคิวเดิมตามลำดับ FIFO; ทุกรายการมี id (attempt: id ของตัวเอง; จบ: `sessionId`) ส่งซ้ำไม่บันทึกซ้ำ
43. คิวอยู่ในหน่วยความจำ: ปิดแท็บขณะมีรายการค้าง คำตอบที่ยังไม่ถึง server หาย (`UnsavedGuard` เตือนเหมือนเดิม) รอบที่ทำต่อจะถามข้อเหล่านั้นใหม่ (ข้อ 22 อ่านจาก server เท่านั้น)
44. งาน PWA ภายหลัง (M3): ตัวดาวน์โหลดล่วงหน้าต้องรวม `checkpoint-XXX.json` ของ A ถัดไปเมื่ออยู่ในช่วง 7 วัน (จดไว้ ไม่ทำในงานนี้)

### 3.8 สูตรพัฒนาการ

| สูตร | ผลของแบบทดสอบ | ต้องทำ |
|---|---|---|
| จุดอ่อน (`weakness.ts`, `drills.ts`) | attempt `checkpoint` (คำตอบแรกของแต่ละข้อ) นับเป็นหลักฐานตามเดิม; `checkpoint_retake` ไม่นับและไม่ใช่กิจกรรม drill | เพิ่มแถวใน `SOURCE_ROLES`; เทสต์ "retake ผิดทั้งหมดแล้วผลไม่เปลี่ยน" |
| คำที่รู้จริง (`vocab.ts`) | **ไม่มีผล** อ่าน SRS อย่างเดียว แบบทดสอบไม่สร้างหรือแก้การ์ด | เทสต์ guard ว่า `srs_cards`/`srs_reviews` ไม่เปลี่ยน |
| คะแนนบท / `progress` | ไม่มีผล (ข้อ 28, 34) | เทสต์ guard แบบ `practice-guard.int.test.ts` |
| CEFR (`cefr.ts`) | "ผ่านสอบวัน D" = มีแถว `checkpoint_results` ของ `afterDay = D` ที่ `score ≥ 0.7` (รอบใดก็ได้); ความคืบหน้าบทเรียน = วันที่ done ที่ ≤ D หาร D; `percentToNext` สูงสุด 99 ถ้ายังไม่ผ่านแบบทดสอบของระดับถัดไป (คง "100% = ผ่านจริง") | เปลี่ยนลายเซ็น `estimateCefr(knownWords, progress, checkpoints)` + PROGRESS §4 |
| pace (`pace.ts`) | ไม่มีผล (นับบทที่ done) | - |
| สตรีค | ข้อ 33 | `ACTIVITY_SOURCES` + `"checkpoint"` |
| เวลาฝึกรวม | `duration_ms` ของทั้งสอง source นับ (เหมือน practice) | เมื่อทำหน้าพัฒนาการ |

`passed` ไม่ถูกเก็บ: คำนวณจาก `score` ด้วย `isCheckpointPass()` ทุกที่ (หลัก "เกณฑ์อยู่ใน config ปรับได้ที่เดียว" ของ PROGRESS)

**สิ่งที่หน้าพัฒนาการ (ยังไม่สร้าง) จะใช้:** `listCheckpointResults(db, userId)` (ทุกรอบ เรียงเวลา: `afterDay`, `score`, `skills`, `completedAt`) และฟังก์ชันล้วน `checkpointSummary(results)` → ต่อ A: จำนวนรอบ, ล่าสุด, ดีที่สุด, ผ่านหรือไม่; `skills` ที่ตรึงไว้ใช้วาดกราฟรายทักษะต่อเดือนได้โดยไม่ต้องอ่านไฟล์ข้อสอบรุ่นเก่า

## 4. สัญญาที่ใช้ร่วมกัน

### 4.1 `src/lib/content/schema.ts` (PR 1)
```ts
export const LESSON_TYPES = ["lesson", "review", "challenge"] as const;
/** d = lesson, c = checkpoint. The validator checks that a file only holds ids of its own kind. */
export const EXERCISE_ID_PATTERN = /^[dc]\d{3}-(pron|listen|speak|read|write|vocab)-\d{2}$/;
export const CHECKPOINT_INTERVAL = 30;
export const isCheckpointDay = (n: number) => Number.isInteger(n) && n >= 30 && n <= 360 && n % 30 === 0;

export const checkpointSectionSchema = sectionSchema.extend({
  /** Share of the total score, 0..100. 0 = shown but not scored (self-rated speaking). */
  weight: z.number().int().min(0).max(100),
  /** Finished days whose section of this skill is offered as remedial replay. */
  reviewDays: z.array(z.number().int().min(1).max(365)).min(1).max(4),
});
export const checkpointSchema = z.strictObject({
  afterDay: z.number().int().refine(isCheckpointDay),
  cefr: z.enum(CEFR_LEVELS),
  title: bilingual,
  estimatedMinutes: z.number().int().positive(),
  sections: z.array(checkpointSectionSchema).min(1),
});
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type CheckpointSection = z.infer<typeof checkpointSectionSchema>;
```
(`isCheckpointDay` ต้อง client-safe: `schema.ts` ถูก import จาก contract อยู่แล้ว) `.extend()` บน `z.strictObject` ต้องยังเป็น strict: ผู้ทำ PR 1 ยืนยันด้วยเทสต์ "key เกินใน section ถูกปฏิเสธ"

`src/lib/content/loader.ts`: `ContentData.checkpoints?: LoadedCheckpoint[]` (`{ file, checkpoint }`, optional เพื่อให้ fixture เดิม compile), `readContent` อ่าน `checkpoints/` ถ้ามี (ชื่อไฟล์อื่นนอกจาก `checkpoint-XXX.json` = problem), `loadCheckpoint(afterDay, root)`
`src/lib/content/repo.ts`: `getCheckpoint(afterDay, root?): Checkpoint | null` (cache ใน production เหมือน `getLesson`; ไฟล์เสีย throw)
`src/lib/content/rules/context.ts`: `RuleContext.checkpoints` และ `RuleContext.units: { file; day; sections }[]` (บทเรียน + แบบทดสอบที่ `day = afterDay`); กฎในข้อ 3.1.6 เปลี่ยนจากวน `ctx.lessons` เป็น `ctx.units`; กฎใหม่ทั้งหมดของข้อ 3.1 อยู่ที่ `src/lib/content/rules/checkpoint.ts` (`rule: "checkpoint"`)

### 4.2 DB (`src/db/schema.ts` + `make db-generate` → `src/db/migrations/0005_*.sql`) (PR 2)
```ts
export const ATTEMPT_SOURCES = ["lesson", "drill", "retest", "checkpoint", "practice", "checkpoint_retake"] as const;
export const ACTIVITY_SOURCES = ["lesson", "practice", "review", "checkpoint"] as const;

export const checkpointResults = pgTable("checkpoint_results", {
  id: uuid("id").primaryKey(),               // = the sitting's sessionId, generated on the client (idempotent)
  userId: userId(),
  afterDay: integer("after_day").notNull(),
  score: doublePrecision("score").notNull(), // 0..1, weighted, frozen at completion
  skills: jsonb("skills").$type<CheckpointSkillResult[]>().notNull(),
  startedAt: tstz("started_at").notNull(),
  completedAt: tstz("completed_at").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("checkpoint_results_user_after_day_idx").on(t.userId, t.afterDay, t.completedAt),
  check("checkpoint_results_after_day_valid", sql`${t.afterDay} BETWEEN 30 AND 360 AND ${t.afterDay} % 30 = 0`),
  check("checkpoint_results_score_range", sql`${t.score} BETWEEN 0 AND 1`),
  check("checkpoint_results_times", sql`${t.completedAt} >= ${t.startedAt}`),
]);
```
migration ต้องมีแค่ `CREATE TABLE`, `CREATE INDEX`, `DROP CONSTRAINT`/`ADD CONSTRAINT` ของ CHECK สองตัว (ไม่ทำลายข้อมูล; `migration-safety.test.ts` ตรวจ)

### 4.3 `src/lib/attempts/contract.ts` (PR 2)
```ts
export const ATTEMPT_SOURCES = [..., "checkpoint_retake"] as const;
export const API = { ..., completeCheckpoint: "/api/checkpoints/complete" } as const;

export type CompleteLessonResponse = { progress; streak; currentDay;
  /** A: the checkpoint that now blocks day A+1, else null. */
  pendingCheckpoint: number | null };

export const completeCheckpointRequestSchema = z.strictObject({
  afterDay: z.number().int().refine(isCheckpointDay), sessionId: z.uuid(), completedAt: isoTimestamp });
export type CheckpointSkillResult = {
  skill: ReplaySkill; weight: number;
  score: number | null;      // null when weight is 0
  answered: number; total: number;
  selfOk: number | null };   // self-rated "ok" count when weight is 0, else null
export type CompleteCheckpointResponse = {
  result: { sessionId: string; afterDay: number; score: number; passed: boolean; skills: CheckpointSkillResult[]; completedAt: string; sitting: number; best: number };
  streak: { current: number; longest: number };
  nextDay: number | null };
```

### 4.4 `src/lib/checkpoints/` (ใหม่ ฟังก์ชันล้วน client-safe เพิ่มใน `src/lib/client-safe.test.ts`) (PR 2)
```ts
// gate.ts
export function blockingCheckpoint(a: { currentDay: number; exists: (afterDay: number) => boolean;
  taken: (afterDay: number) => boolean; currentDayStarted: boolean }): number | null;
export const playableDay = (currentDay: number, blocking: number | null) => (blocking === null ? currentDay : currentDay - 1);
// score.ts
export type ScoreRow = { id?: string; exerciseId: string; score: number | null; correct: boolean; createdAt: Date };
export function scoreCheckpoint(cp: Checkpoint, rows: readonly ScoreRow[]): { score: number; skills: CheckpointSkillResult[] };
export const isCheckpointPass = (score: number) => score >= CHECKPOINT_PASS_SCORE - 1e-9;
export const weakSkills = (skills: readonly CheckpointSkillResult[]) => skills.filter((s) => s.weight > 0 && !isCheckpointPass(s.score ?? 0));
export function checkpointSummary(results): …  // ข้อ 3.8
// config: CHECKPOINT_RESUME_HOURS = 24, MIN_SCORED_EXERCISES = 3
```
`scoreCheckpoint`: ต่อส่วน `weight > 0`: ค่าเฉลี่ยของคะแนนทุกข้อในส่วน (ข้อที่ไม่มีแถวหรือ `score` null = 0; หลายแถว = เก่าสุด, เวลาเท่ากันใช้ id น้อยกว่า); รวม = Σ(weight × คะแนนส่วน) / 100

### 4.5 `src/lib/progress/` (PR 2)
```ts
// types.ts
export type AttemptSourceLike = "lesson" | "drill" | "retest" | "checkpoint" | "practice" | "checkpoint_retake";
// sources.ts
checkpoint:        { detection: true,  drillActivity: false, touchesProgress: false }, // เปลี่ยนจาก true
checkpoint_retake: { detection: false, drillActivity: false, touchesProgress: false },
```
`DETECTION_SOURCES` ยังเป็น `["lesson","checkpoint"]`

### 4.6 `src/lib/offline/sink.ts` + `http-sink.ts` (PR 2)
`SyncSink.completeCheckpoint(c): Promise<CompleteResult<CompleteCheckpointResponse>>` ผ่าน `enqueueComplete(API.completeCheckpoint, \`${API.completeCheckpoint}|${c.afterDay}|${c.sessionId}\`, c, isCheckpointResponse)`; `isCheckpointResponse` = มี `result` (object ที่ `skills` เป็น array) และ `streak`; fake sink ทุกตัวในเทสต์เพิ่ม stub (หาได้ด้วย `grep -rl "completePractice" src --include=*.test.tsx --include=test-helpers.tsx`)

### 4.7 `src/db/queries/checkpoints.ts` (ใหม่) (PR 2)
- `getCheckpointGate(db, userId, profile, content): Promise<{ blocking: number | null; playableDay: number }>` (อ่าน DB เฉพาะเมื่อ `isCheckpointDay(currentDay − 1)` และไฟล์มี)
- `listCheckpointResults(db, userId, afterDay?)`, `insertCheckpointResult(tx, row): Promise<boolean>`, `getCheckpointResult(tx, userId, id)`
- `sittingRows(tx, userId, afterDay, sessionId, exerciseIds): Promise<ScoreRow[]>`
- `findOpenSitting(db, userId, afterDay, now): Promise<{ sessionId: string; answered: string[] } | null>`
- `hasEarlierAnswer(tx, userId, exerciseId, exceptId): Promise<boolean>` (ใช้ index `attempts_user_id_exercise_id_idx`)
- `practisedSince(db, userId, exerciseIds, since): Promise<Set<string>>` (ข้อ 38)
- `getCheckpointOverview(db, userId, content, now)`: ทุก A ที่เปิด + สถานะ (ยังไม่สอบ / ล่าสุด / ดีที่สุด / ผ่าน) สำหรับ `/practice` และหน้าแรก

### 4.8 เจ้าของไฟล์
| PR | ไฟล์ |
|---|---|
| 1 | `src/lib/content/{schema,loader,repo,validate}.ts`, `src/lib/content/rules/{context,index,checkpoint,taught-words,grammar-not-yet,pronunciation,sound-words,arrange-words,arrange-question,answer-forms,thai-names}.ts` (+tests), `src/lib/answers/test-content.ts` (fixture), `docs/CONTENT_SCHEMA.md`, `CLAUDE.md` (กฎ ID), `docs/ARCHITECTURE.md` §3 |
| 2 | `src/db/schema.ts`, migration 0005, `src/lib/attempts/contract.ts`, `src/lib/offline/{sink,http-sink}.ts`, `src/lib/progress/{types,sources}.ts`, `src/lib/checkpoints/*`, `src/db/queries/checkpoints.ts`, stub ใน fake sink, `src/lib/client-safe.test.ts` |
| 3 | `src/lib/server/{attempts-handler,complete-handler,checkpoint-complete-handler}.ts`, `src/lib/attempts/derive.ts`, `src/app/api/checkpoints/complete/route.ts`, `src/db/queries/home.ts`, `eslint.config.mjs`, `docs/ARCHITECTURE.md` §4/§5.1, `docs/PROGRESS.md` §1/§3/§5, ตาราง API ใน `docs/FEATURE_MAP.md` |
| 3b | `src/lib/progress/{cefr,types}.ts` (+test), `docs/PROGRESS.md` §4 |
| 4 | `src/components/exercises/*.tsx`, `src/components/exercises/types.ts`, `ui/CheckButton.tsx`, เทสต์ guard ใหม่ |
| 5 | `src/components/player/{player-state.ts,PlayerFrame.tsx,LessonPlayer.tsx}`, `src/components/checkpoint/*`, `src/app/(learn)/checkpoint/[n]/page.tsx`, `src/app/(learn)/access.ts`, แถวหน้าจอใน `docs/FEATURE_MAP.md` |
| 6 | `src/app/(main)/page.tsx`, `src/app/(main)/practice/page.tsx`, `src/app/today/page.tsx`, `src/app/(learn)/day/[day]/page.tsx`, `src/components/player/CompletionScreen.tsx` (+tests), แถวใน `docs/FEATURE_MAP.md` |
| 7 | `content/checkpoints/checkpoint-030.json`, `src/lib/content/rules/allowlists.ts` (ถ้าจำเป็นจริง) |
| 8 | `e2e/zz-checkpoint.spec.ts`, `e2e/helpers/checkpoint.ts`, `docs/FEATURE_MAP.md` (คอลัมน์เทสต์), `docs/PLAN.md`, `docs/TESTING.md` |

## 5. แผน PR

ทุก PR: เทสต์ที่ล้มก่อน แล้ว commit ก่อนโค้ด; `make check` จาก checkout หลัก; ใน worktree ใช้ `make worktree-check` เท่านั้น; ผ่าน `qa-tester` + `code-reviewer` (PR 7: `content-reviewer`)

ลำดับและการทำคู่ขนาน:
```
PR 1 ──► PR 2 ──► PR 3 ──┐
  │        │             ├──► PR 6 ──► PR 7 (merge) ──► PR 8
  │        ├──► PR 5 ────┘
  │        └──► PR 3b
  ├──► PR 4 (เริ่มได้ทันที ไม่ขึ้นกับใคร)
  └──► PR 7 (เขียน/ตรวจใน worktree ได้ตั้งแต่ PR 1 merge แต่ merge หลัง PR 6)
```
- PR 1, 2, 3 ทำทีละอันใน checkout หลัก (แก้ schema/migration และต้องรัน integration test)
- คู่ขนานใน worktree: PR 4 (frontend-dev) กับ PR 1; PR 5 (frontend-dev, ใช้ fake sink) และ PR 3b (backend-dev, unit อย่างเดียว) กับ PR 3; PR 7 (content-writer) ตลอด
- **PR 7 ห้าม merge ก่อน PR 6:** ถ้ามีไฟล์ข้อสอบแต่ยังไม่มีหน้าจอ server จะล็อกวัน 31 โดยไม่มีทางสอบ PR 3–6 ตรวจกับแอปจริงโดยคัดลอกไฟล์ร่างจาก branch ของ PR 7 มาวางใน `content/checkpoints/` **โดยไม่ commit**

### PR 1 `feat/checkpoint-content-schema` (backend-dev) — [x] ทำแล้ว 2026-11-28 (รอ merge)
บันทึกการตีความ: schema ของแบบทดสอบอยู่ที่ `src/lib/content/checkpoint-schema.ts` (ไม่ใช่ `schema.ts`; `schema.ts` แก้แค่ `LESSON_TYPES`, regex ของ ID, export `bilingual`) PR 2 ให้ import `isCheckpointDay`/`CHECKPOINT_INTERVAL` จากไฟล์นั้น; `.extend()` ของ Zod 4 คง strict (มีเทสต์); ค่าคงที่ `CHECKPOINT_MIN_SCORED_EXERCISES = 3` อยู่ในไฟล์เดียวกัน (PR 2 ใช้ซ้ำแทนการประกาศ `MIN_SCORED_EXERCISES` ใหม่); fixture ใช้บทจริงวัน 1–30 ตอนตรวจ เพราะ is/this/he/yes สอนในวัน 8–15
สัญญา: ข้อ 3.1 ทั้งหมด + 4.1; repo ที่ไม่มีแบบทดสอบต้องผ่าน `make validate` เหมือนเดิม
- เทสต์ก่อน: `schema.test.ts` (รับแบบทดสอบตัวอย่าง; ปฏิเสธ key เกิน, `afterDay` 31, `weight` 101, `reviewDays` ว่าง; `type: "checkpoint"` ของบทเรียนถูกปฏิเสธ; id `c030-read-01` ผ่าน regex); `loader.test.ts` (ไม่มีโฟลเดอร์ = ไม่มี problem; ไฟล์ชื่อผิด = problem; `loadCheckpoint`); `repo.test.ts` (`getCheckpoint` null/throw); `validate.test.ts` + `rules/checkpoint.test.ts` หนึ่งเทสต์ต่อกฎของข้อ 3.1 ข้อ 2–11 (แต่ละกฎต้องมีทั้งเคสผ่านและเคสล้ม); `taught-words.test.ts`/`grammar-not-yet.test.ts` (ข้อสอบ A=30 ใช้คำที่สอนวัน 31 → error; ใช้ `lives` → error; ใช้ `has` → ผ่าน); cast rules ไม่รายงานแบบทดสอบ
- fixture: `checkpointFixture` ใน `src/lib/answers/test-content.ts` (A = 30 ใช้คำของ `weekOne` เท่านั้น ครบ 5 ส่วน ส่วนละน้อยข้อ) ให้ PR ถัดไปใช้ผ่าน seam `content` เทสต์ห้ามอ่าน `content/checkpoints/` จริง (กติกาใน `docs/TESTING.md`)
- ตรวจกับของจริง: `make validate` → `content: OK` ตัวเลขสรุปเท่าเดิม; คัดลอก `content/` ไปโฟลเดอร์ชั่วคราว ใส่ `checkpoints/checkpoint-030.json` ที่มีคำของวัน 31 แล้ว `docker compose run --rm app pnpm content:validate <dir>` → เห็น `== rule taught-words` ชี้ `[c030-…]` และ exit ≠ 0

### PR 2 `feat/checkpoint-contract` (backend-dev)
สัญญา: ข้อ 4.2–4.7; ไม่มีพฤติกรรมที่ผู้เรียนเห็นเปลี่ยน
- เทสต์ก่อน: `schema.int.test.ts` (insert `checkpoint_results`; `after_day` 31 / `score` 1.2 → 23514; attempt `source='checkpoint_retake'` ได้; `activity_days` `'checkpoint'` ได้); `contract.test.ts` (array/type test; schema คำขอปฏิเสธ `afterDay` 45, ฟิลด์เกิน); `sources.test.ts` (ทั้งสอง source `touchesProgress` false; `DETECTION_SOURCES` เท่าเดิม); `weakness.test.ts`/`drills.test.ts` (เพิ่ม `checkpoint_retake` ผิดทั้งหมด ผล `toEqual` เดิม); `gate.test.ts` (ตารางความจริงของ 4 เงื่อนไข + `currentDay` 1, 31, 32, 361); `score.test.ts` (ถ่วงน้ำหนัก, ข้อไม่ตอบ = 0, เก่าสุดชนะ, ส่วนพูด `score` null + `selfOk`, 0.7 พอดีผ่าน); `http-sink.test.ts` (`completeCheckpoint`: FIFO หลัง attempt, 409 → rejected, 5xx → queued, กันซ้ำด้วย sessionId); `checkpoints.int.test.ts` (ทุก query ในข้อ 4.7 รวม `findOpenSitting` ที่ขอบ 24 ชม. และรอบที่มีผลแล้ว, `getCheckpointGate` กับ content ที่ฉีด)
- ตรวจกับของจริง: `make db-migrate` → "applied 1"; `\d+ checkpoint_results`; `\d+ attempts` เห็น `checkpoint_retake` ใน CHECK; อ่าน SQL ที่ generate; เล่น `/day/1` จนจบได้เหมือนเดิม

### PR 3 `feat/checkpoint-server` (backend-dev)
สัญญา: ข้อ 3.2 (ฝั่ง server), 3.4, 3.5
- `attempts-handler.ts`: แทน `dayOf` + `getLesson` ด้วยตัวหา container ตาม prefix (`d` → บท, `c` → แบบทดสอบ); `findExercise`/`deriveTags` ใน `derive.ts` รับ `Pick<Lesson, "sections">`; ใช้ `playableDay` จาก `getCheckpointGate`
- `complete-handler.ts`: ใช้ `playableDay`; เติม `pendingCheckpoint`
- `getLearnerHome` (`src/db/queries/home.ts`): เพิ่ม `blockingCheckpoint: number | null` และ `checkpointNote: { afterDay; status } | null` (แบบทดสอบล่าสุดที่เปิดแล้วและยังไม่สอบหรือยังไม่ผ่าน)
- เทสต์ก่อน (int ใช้ `checkpointFixture` ผ่าน seam `content`): `attempts-handler.int.test.ts` (ข้อ 24–28 ทีละข้อ; คำตอบที่สองของข้อเดิมเก็บเป็น `checkpoint_retake`; รายการ `d031-…` ขณะกั้น → `locked_day`; หลังมีผล → `created`); `complete-handler.int.test.ts` (จบวัน 30 → `pendingCheckpoint: 30`; จบวัน 31 ขณะกั้น → 409; ไม่มีไฟล์ → `null` และวัน 31 จบได้); `checkpoint-complete-handler.int.test.ts` (ข้อ 29–35: คะแนนตรงสูตร, เรียกซ้ำผลเดิมแถวเดียว, สองคำขอพร้อมกันแถวเดียว, 409 สามกรณี, `activity_days(source='checkpoint')`, `sitting`/`best` ของรอบที่สอง, `nextDay`); `checkpoint-guard.int.test.ts` (snapshot `progress`, `profiles`, `srs_cards`, `srs_reviews` ก่อน/หลังส่ง attempt + จบสองรอบ → `toEqual`); `checkpoint-imports.test.ts` + ESLint `no-restricted-imports` สำหรับ `src/lib/server/checkpoint-*.ts` (ชุดเดียวกับ `practice-*`); `home.int.test.ts`; `routes.test.ts` (415/400/413)
- เอกสาร: ARCHITECTURE §4 (ตาราง, ค่าของ source), §5.1 (endpoint, กติกา `c…`, การล็อก); PROGRESS §1 (`checkpoint_retake`), §3 (ไม่นับ), §5 (สตรีค)
- ตรวจกับของจริง (วางไฟล์ร่างของ PR 7 ชั่วคราว; ฐานข้อมูล dev ใหม่): จบวัน 1–30 ด้วย `POST /api/lessons/complete` ทีละวัน → คำตอบของวัน 30 มี `"pendingCheckpoint":30`; จบวัน 31 → 409 `locked_day`; POST attempt `c030-listen-01` → `created`; `POST /api/checkpoints/complete` → 200 มี `result.score`, `skills` 5 แถว, `nextDay: 31`; เรียกซ้ำผลเดิม; `select after_day, score from checkpoint_results` 1 แถว; `select source, count(*) from attempts where exercise_id like 'c030%' group by 1`; จบวัน 31 ได้ 200; `select day, score, completed_at from progress where day = 30` ไม่เปลี่ยนก่อน/หลัง

### PR 3b `feat/checkpoint-cefr` (backend-dev, คู่ขนาน)
สัญญา: แถว CEFR ของข้อ 3.8; เพิ่ม `CheckpointResultLike = { afterDay: number; score: number }` ใน `src/lib/progress/types.ts`
- เทสต์ก่อน (`cefr.test.ts`): วัน 60 done คะแนนบท 100% แต่ไม่มีผลแบบทดสอบ → ยัง preA1; ผล 0.7 + 400 คำ → A1; สองรอบ (0.5 แล้ว 0.8) → ผ่าน; ครบทุกอย่างยกเว้นแบบทดสอบ → `percentToNext` 99
- ตรวจ: `make test-unit` (ไม่มีหน้าจอใช้สูตรนี้ จึงไม่มีอะไรให้ดูในแอป เขียนไว้ใน PR)

### PR 4 `feat/exercise-conceal` (frontend-dev, คู่ขนานตั้งแต่ต้น; ตัดทิ้งถ้า D5 = เฉลยทันที)
สัญญา: `ExerciseProps` มี `reveal?: boolean` (ค่าตั้งต้น true) เมื่อ `false` และมี `result`: ล็อกข้อและซ่อนปุ่มยืนยันเหมือนเดิม แต่ไม่มีสีถูก/ผิด ไม่มี `Mark` ไม่มี `data-state="right|wrong"` ไม่ชี้ตัวเลือกที่ถูก; `CheckButton` อ่านป้ายจาก context (`CheckLabelContext`, ค่าตั้งต้น "ตรวจคำตอบ"); พฤติกรรมเดิมไม่เปลี่ยน
- เทสต์ก่อน: `conceal-guard.test.tsx` (เดินทุกข้อของ `weekOne` แบบเดียวกับ `a11y-guard.test.tsx`: render ด้วย `result` ผิด + `reveal={false}` → ไม่มี `[data-state=right]`/`[data-state=wrong]`, ไม่มีข้อความ sr-only "ถูก"/"ผิด", input ถูก disable; ชุดเดียวกันด้วย `reveal` ตั้งต้นยังมีสถานะ = guard ว่าเทสต์จับได้จริง); `CheckButton.test.tsx` (ป้ายจาก context)
- ตรวจกับของจริง: `/day/1` ที่ 360px ทั้ง 13 ชนิดยังเฉลยตามเดิม (ไม่มีอะไรเปลี่ยนให้เห็น)

### PR 5 `feat/checkpoint-player` (frontend-dev)
สัญญา: ข้อ 3.2.17, 3.3, 3.6, 3.7 ที่ `/checkpoint/[n]`
- commit แรก (refactor ไม่เปลี่ยนพฤติกรรม เทสต์เดิมของ `LessonPlayer*` ต้องผ่านโดยไม่แก้): แยกหัว (ชื่อส่วน, "ข้อ x / n", แถบ) และแถบล่าง sticky ออกเป็น `src/components/player/PlayerFrame.tsx`
- `player-state.ts`: `createPlayerState` รับ `retry?: boolean` (false = ไม่สร้างรอบทวน) และ `skipIds?: ReadonlySet<string>`; รับ `sections` แทนการพึ่ง `lesson` (แบบทดสอบไม่ใช่ `Lesson`)
- `src/components/checkpoint/`: `CheckpointApp.tsx` (client boundary: sink, สถานะ intro/playing/result, `router.refresh()` ครั้งเดียวหลัง `done` โดย **จำสถานะตอน mount** ห้ามใส่สถานะใน `key`: ความเสี่ยงเดียวกับ R1 ของแผนเล่นซ้ำ), `CheckpointIntro.tsx`, `CheckpointPlayer.tsx`, `CheckpointResult.tsx`; เพิ่มใน `client-safe.test.ts`
- หน้า `src/app/(learn)/checkpoint/[n]/page.tsx` (`force-dynamic`): ข้อ 17 แล้วส่ง `checkpoint`, vocab lookup (id ใน `vocab_match`), `history`, `resume`, `retakeAllowed`, `practised` ให้ `CheckpointApp`
- เทสต์ก่อน: `player-state.test.ts` (`retry:false` ผิดแล้วจบเลย; `skipIds` ข้ามและตัวนับถูก); `CheckpointPlayer.test.tsx` (fake sink: ทุก attempt `source:"checkpoint"`, `attemptNo:1`, `sessionId` เดียว; หลังตอบผิดไม่มี "ยังไม่ถูก"/"คำตอบที่ถูกต้อง", มี "บันทึกคำตอบแล้ว" + "ถัดไป"; ปุ่มหลักเดียวต่อช่วง; จบแล้วเรียก `completeCheckpoint` ครั้งเดียวด้วยคำขอเดิมเมื่อ retry; resume ใช้ `sessionId` ที่ให้และเริ่มข้อที่ยังไม่ตอบ); `CheckpointResult.test.tsx` (ข้อ 36–41 ทุกกิ่ง); `CheckpointApp.test.tsx` (guard refresh: หลัง `done` rerender ด้วย props ใหม่ ยังเห็นผลรอบนี้); `page.test.tsx` (ทุกกิ่งของข้อ 17, `/checkpoint/45` และ `/checkpoint/030` → 404, สอบวันนี้แล้ว → ไม่มีปุ่มเริ่ม); `touch-targets`/a11y: ทุกปุ่ม/ลิงก์ ≥ `min-h-11`, อังกฤษอยู่ใต้ `lang="en"`
- ตรวจกับของจริง (ต้องมี PR 3 + ไฟล์ร่าง; Chrome 360px ทั้งสองธีม): จบวัน 1–30 ผ่าน API → `/checkpoint/30` เห็นหน้าเริ่ม → ทำ 5 ข้อ → รีโหลด → "ทำต่อ (ข้อ 6 / n)" → ทำจนจบ → หน้าผลมีคะแนนรวม, 5 แถวทักษะ, สตรีค, "ไปบทเรียนวันที่ 31"; ตอบผิดโดยตั้งใจระหว่างทางไม่เห็นเฉลย; ไม่มีแถบเลื่อนแนวนอน; `/checkpoint/60` → "ยังไม่ปลดล็อก"; เปิด `/checkpoint/30` อีกครั้ง → ผลล่าสุด + "สอบอีกครั้งได้ตั้งแต่พรุ่งนี้"

### PR 6 `feat/checkpoint-entry-points` (frontend-dev)
สัญญา: D10, D15, ข้อ 15 (ฝั่งหน้า)
- หน้าแรก: `blockingCheckpoint` ไม่ null → การ์ดหลัก "แบบทดสอบประจำเดือน ครั้งที่ k · วันที่ 1–A" ลิงก์หลักเดียว "เริ่มแบบทดสอบ" → `/checkpoint/A` (ไม่มี "เริ่มบทเรียนวันที่ …"); ไม่กั้นแต่มี `checkpointNote` → แถวลิงก์รองใต้การ์ดบท (รูปแบบเดียวกับ `HomeReviewLink`): "แบบทดสอบครั้งที่ k · ยังไม่ได้สอบ" หรือ "… · ยังไม่ผ่าน ดูผลและฝึกซ่อม"
- `/today`: กั้น → redirect `/checkpoint/A`
- `/day/[day]`: `day === current_day` และกั้น → `StatusScreen` "ทำแบบทดสอบประจำเดือนก่อน" + ปุ่ม "ไปทำแบบทดสอบ"; วันอื่นที่ล็อกใช้ข้อความเดิมแต่ลิงก์ไป `playableDay`
- `CompletionScreen`: `pendingCheckpoint` ไม่ null → ปุ่มหลัก "ไปทำแบบทดสอบ" → `/checkpoint/A` แทน "ไปบทถัดไป"
- `/practice`: section "แบบทดสอบประจำเดือน" (ระหว่างการ์ดทวนคำศัพท์กับรายการเล่นซ้ำ) แถวละครั้งที่เปิดแล้ว: "ครั้งที่ k · วันที่ 1–A" + สถานะ ("ยังไม่ได้สอบ" / "ผ่าน · ดีที่สุด B%" / "ยังไม่ผ่าน · ล่าสุด L%") → `/checkpoint/A`; ไม่มีครั้งที่เปิด: ไม่แสดง section
- เทสต์ก่อน: `(main)/page.test.tsx`, `practice/page.test.tsx`, `today/page.test.tsx`, `day/[day]/page.test.tsx`, `CompletionScreen` (ใน `LessonPlayer.test.tsx`), `(main)/layout.test.tsx` (mock query ใหม่)
- ตรวจกับของจริง (360px): จบวัน 30 ในตัวเล่นจริง → หน้าจบมี "ไปทำแบบทดสอบ"; หน้าแรกเป็นการ์ดแบบทดสอบ; `/today` → `/checkpoint/30`; `/day/31` → "ทำแบบทดสอบประจำเดือนก่อน"; หลังสอบจบ: หน้าแรกเป็น "วันที่ 31", `/practice` มีแถวพร้อมคะแนน; ลบไฟล์ร่างออกแล้วรีสตาร์ต: ทุกหน้ากลับเป็นแบบเดิม และวัน 31 เปิด (พิสูจน์ "ไม่มีไฟล์ = ไม่มีล็อก")

### PR 7 `content/checkpoint-030` (content-writer → content-reviewer)
สัญญา: ไฟล์ตามโครงข้อ 8 ผ่าน `make validate` ไม่มี error และ warning ของกฎ `checkpoint` ต้องอธิบายใน PR ทีละข้อ
- รายการที่ content-reviewer ตรวจด้วยมือ (เครื่องตรวจไม่ได้): ทุกหัวข้อไวยากรณ์ของข้อ 8 มีข้อสอบ; ไม่มีข้อที่ตอบถูกได้สองแบบโดยไม่มีใน `accept`; ตัวลวงของ `listen_choose`/`read_passage` ผิดจริง; คู่ `minimal_pair` ต่างกันที่เสียงเป้าหมายเสียงเดียว; ประโยคไม่ซ้ำกับบท; ภาษาไทยของคำสั่งชัด; ระดับไม่ยากกว่าวันทบทวน 27
- ตรวจกับของจริง: หลัง merge เล่นทั้งชุดหนึ่งรอบใน Chrome 360px จับเวลา (เป้า 25–35 นาที) และฟังทุกข้อเสียง

### PR 8 `test/checkpoint-e2e` (qa-tester)
- `e2e/zz-checkpoint.spec.ts` (360px): ชื่อขึ้นต้น `zz-` เพื่อรันหลังทุกสเปก เพราะมันจบวัน 1–30 ของผู้เรียนที่ใช้ร่วมกัน (เขียนเหตุผลไว้ที่หัวไฟล์และใน `docs/TESTING.md`); `beforeAll` จบวัน 1–30 ผ่าน `POST /api/lessons/complete` (ข้ามวันที่จบแล้ว) และอุ่น route ใหม่
- เส้นทาง: หน้าแรกมี "เริ่มแบบทดสอบ" และไม่มี "เริ่มบทเรียนวันที่" → `/day/31` ถูกกั้น → เริ่มสอบ → ตอบ ~1/3 (helper `e2e/helpers/checkpoint.ts` ใช้ไฟล์ข้อสอบเป็นเฉลย แบบเดียวกับ `helpers/day1.ts` ปุ่ม "ยืนยันคำตอบ"; รองรับทั้งโหมดมีเสียงและ "ข้าม") โดยตอบผิดหนึ่งข้อแล้วยืนยันว่าไม่มี "คำตอบที่ถูกต้อง" → `page.reload()` → "ทำต่อ" → ตัวนับไม่เริ่มที่ 1 → ทำจนจบ → หน้าผล (h1, คะแนนรวม, 5 แถว, สตรีค) → "ไปบทเรียนวันที่ 31" เปิดตัวเล่นได้ → หน้าแรกเป็นวันที่ 31 → `/practice` มีแถวแบบทดสอบ → `/checkpoint/30` ไม่มีปุ่มเริ่ม; ไม่มีแถบเลื่อนแนวนอนทุกหน้า
- ไม่ยืนยันค่าคะแนน (ใน CI ไม่มีเสียง ข้อฟังถูกข้าม = 0) ค่าคะแนนถูกครอบด้วย integration test
- ปิดงาน: คอลัมน์เทสต์ใน FEATURE_MAP, ติ๊ก "สอบวัดผลรายเดือน" ใน `docs/PLAN.md` พร้อมรายการ "ยังไม่ได้ตรวจ" (มือถือจริง, เสียงจริง, ออฟไลน์กลางรอบ, ข้ามเที่ยงคืน, screen reader)

### แถวสำหรับ `docs/FEATURE_MAP.md`
| หน้าจอ/API | ไปถึงอย่างไร | พิสูจน์ว่าทำงาน | เทสต์ |
|---|---|---|---|
| แบบทดสอบ `/checkpoint/N` หน้าเริ่ม | จบวัน 1–N (API) แล้วเปิด `/checkpoint/30` หรือกด "เริ่มแบบทดสอบ" บนหน้าแรก | ไม่มีเมนูหลัก; h1 "แบบทดสอบประจำเดือน ครั้งที่ 1"; จำนวนข้อ, เวลา, กติกา; ปุ่ม "เริ่มแบบทดสอบ"; วัน N ยังไม่จบ: "ยังไม่ปลดล็อก"; ไม่มีไฟล์: "ยังไม่มีแบบทดสอบนี้"; `/checkpoint/45` → 404 | `checkpoint/[n]/page.test.tsx`, `e2e/zz-checkpoint.spec.ts` |
| แบบทดสอบ: ทำข้อสอบ | กด "เริ่มแบบทดสอบ" | "ข้อ x / n"; ปุ่ม "ยืนยันคำตอบ"; หลังยืนยัน "บันทึกคำตอบแล้ว" + "ถัดไป" ไม่มีถูก/ผิด/เฉลย; รีโหลดแล้วมี "ทำต่อ (ข้อ x / n)"; DB: `select source, attempt_no, session_id from attempts where exercise_id like 'c030%'` เป็น `checkpoint`, 1, session เดียว | `CheckpointPlayer.test.tsx`, `conceal-guard.test.tsx`, `player-state.test.ts`, E2E |
| แบบทดสอบ: ผล | ทำครบทุกข้อ | h1 "ผลแบบทดสอบ ครั้งที่ 1"; "ผ่าน"/"ยังไม่ผ่าน"; "คะแนนรวม N%"; แถวทักษะ 5 แถว (พูด "ไม่นับคะแนน"); "ควรฝึกซ่อม" + ลิงก์ `/day/N?skill=S` เมื่อมีทักษะ < 70%; สตรีค; "ไปบทเรียนวันที่ 31"; DB: `checkpoint_results` 1 แถว, `activity_days` วันนี้, `progress`/`profiles` ไม่เปลี่ยน | `CheckpointResult.test.tsx`, `checkpoint-complete-handler.int.test.ts`, `checkpoint-guard.int.test.ts`, E2E |
| ล็อกวันถัดจากแบบทดสอบ | จบวัน 30 โดยยังไม่สอบ แล้วเปิด `/`, `/today`, `/day/31` | หน้าแรก: การ์ดแบบทดสอบ ปุ่มหลักเดียว; `/today` → 307 `/checkpoint/30`; `/day/31`: "ทำแบบทดสอบประจำเดือนก่อน"; หลังสอบจบ (คะแนนใดก็ได้) ทั้งหมดกลับเป็นวันที่ 31; ไม่มีไฟล์ข้อสอบ: ไม่ล็อก | `gate.test.ts`, `checkpoints.int.test.ts`, `(main)/page.test.tsx`, `today/page.test.tsx`, `day/[day]/page.test.tsx`, E2E |
| `/practice`: แบบทดสอบประจำเดือน | เปิด `/practice` หลังจบวัน 30 | section "แบบทดสอบประจำเดือน": "ครั้งที่ 1 · วันที่ 1–30" + สถานะ → `/checkpoint/30` | `practice/page.test.tsx`, E2E |
| `POST /api/checkpoints/complete` | `{"afterDay":30,"sessionId":"<uuid>","completedAt":"<ISO>"}` | 200 `{result:{score,passed,skills,sitting,best}, streak, nextDay}`; เรียกซ้ำผลเดิม; 409 `not_completable` (ไม่มีไฟล์ / วัน 30 ยังไม่ done / รอบไม่มี attempt) | `checkpoint-complete-handler.int.test.ts`, `routes.test.ts` |
| `POST /api/attempts` (`c…`) | item `exerciseId:"c030-listen-01"`, `source:"checkpoint"` | วัน 30 done → `created`; ยังไม่ done → `not_finished`; `attemptNo:2` หรือ source อื่น → `invalid`; ตอบข้อเดิมครั้งที่สอง → แถว `checkpoint_retake` | `attempts-handler.int.test.ts` |
| `POST /api/lessons/complete` (`pendingCheckpoint`) | จบวัน 30 | response มี `"pendingCheckpoint":30`; จบวัน 31 ก่อนสอบ → 409 `locked_day` | `complete-handler.int.test.ts` |

## 6. ฝึกซ่อม (รุ่นเล็กที่สุดที่ใช้ได้)
ไม่มีเนื้อหาใหม่ ไม่มีตารางใหม่ ไม่มีสถานะใหม่: (1) ไฟล์ข้อสอบบอก `reviewDays` ต่อส่วน (2) หน้าผลแสดงลิงก์เล่นซ้ำของทักษะที่ต่ำกว่าเกณฑ์ (3) ✓ มาจาก attempt `practice` ที่ทำหลังรอบสอบ (4) สอบซ้ำได้พรุ่งนี้ การเล่นซ้ำใช้กติกาเดิมทุกอย่าง (ไม่แตะคะแนนบท, ทีละทักษะไม่นับสตรีค) เมื่อบทพัฒนาจุดอ่อน (PROGRESS §3.1) มีจริง หน้าผลเพิ่มลิงก์ไปบทฝึกของจุดอ่อนที่ `weakPoints()` รายงานได้โดยไม่เปลี่ยนข้อมูล เพราะคำตอบแบบทดสอบเป็นหลักฐานจุดอ่อนอยู่แล้ว

## 7. ไม่ทำใน v1
- หน้าทบทวนรายข้อหลังสอบ, เฉลยพร้อมคำอธิบาย
- คะแนนคำศัพท์แยก (D14), ให้คะแนนพูดด้วยเครื่อง, `free_write` ที่ AI ตรวจ
- สุ่มข้อ / คลังข้อสอบหลายชุด (สอบซ้ำใช้ชุดเดิม จึงมี D4 และ D11)
- จับเวลา, ย้อนกลับไปแก้ข้อก่อนหน้า
- บังคับ cooldown ของการสอบซ้ำที่ server; ปฏิเสธ attempt ที่มาหลังรอบจบแล้ว
- บังคับทำฝึกซ่อมก่อนสอบซ้ำ
- เปิดแบบทดสอบขณะออฟไลน์, คิว IndexedDB (รอ PWA)
- หน้าพัฒนาการ (แผนนี้ให้แค่ query และฟังก์ชันสรุป)
- แบบทดสอบครั้งที่ 2 เป็นต้นไป (เนื้อหา), การแจ้งเตือน

## 8. โครงเนื้อหาครั้งที่ 1 (`checkpoint-030.json`, A = 30, `cefr: "preA1"`, ประมาณ 30 นาที, 31 ข้อ)

ข้อจำกัดจากตัวตรวจ: คำที่สอนถึงวัน 30 เท่านั้น (คำของวัน 31–35 เช่น tall, left, right, animal ห้ามใช้); ใช้ `has` ได้; ห้าม -s บุรุษที่สามของกริยาอื่น (`lives`), ห้าม `do not`/`don't`, เลี่ยง `but` (warning); ตัวละครและชื่อไทยตาม `PROPER_NAMES`/`THAI_NAMES`; ทุกประโยคเขียนใหม่ ไม่คัดจากบท

| ส่วน (weight) | ข้อ | ชนิด | ครอบคลุม | `reviewDays` |
|---|---|---|---|---|
| ออกเสียง (20) ~5 นาที | 7 ข้อ ข้อละ 4 คู่ | `minimal_pair` ทุกข้อมี `phonemes` | 1) สระสั้น `ae`/`eh` (วัน 1–2) 2) `ih`/`ee` สั้น–ยาว (3, 8) 3) สระยาว `oo`, `or`, `er`, `ar` เทียบสระสั้น `aa`, `ah` (4–5, 9–12) 4) `th`/`dh` เทียบ /s/ /t/ /d/ (15–18) 5) `v`/`w` (17, 19) 6) `r`/`l` (22–23) 7) ท้ายคำ `z`/`s`, `d`/`t`, `g`/`k` (24–25, 29–30) | 13, 20, 27 |
| ฟัง (25) ~6 นาที | 4 + 3 | `listen_choose` ×4, `dictation` ×3 | LC1 ทักทาย/มาจากไหน/สะกดชื่อ (สัปดาห์ 1) · LC2 อายุและตัวเลข 11–100, he is / she is (สัปดาห์ 2) · LC3 ครอบครัว this/that/these/those, How many (สัปดาห์ 3) · LC4 ราคา How much + สี + in/on/under (สัปดาห์ 4) · D1 ประโยค be + ตัวเลข · D2 "These are …" + คำครอบครัว (เสียง /ð/) · D3 have/has + ร่างกาย (วัน 29–30) | 13, 20, 27 |
| พูด (0) ~4 นาที | 4 | `shadowing` ×1 (3 บรรทัด), `repeat_after_me` ×1, `speak_answer` ×2 | เงาเสียง: บทแนะนำตัวสั้น · พูดตาม: ประโยครวมเสียง /θ/ /v/ /r/ /l/ · ตอบ: แนะนำตัว (ชื่อ, มาจากไหน, อายุ) · ตอบ: บรรยายคนในครอบครัวด้วย has + ผม/ตา | 14, 21, 28 |
| อ่าน (20) ~6 นาที | 3 บท บทละ 3 คำถาม | `read_passage` (ไม่มี `glossary`) | R1 แนะนำตัว + ครอบครัว (be, ตัวเลข, this is my …) · R2 ห้องและของใช้: สี, a/an/the, in/on/under, these/those · R3 บทสนทนาร้านค้า (ราคา, How much) + บรรยายคน (have/has, long/short, สี) | 13, 20, 27 |
| เขียน (35) ~9 นาที | 10 | `arrange_words` ×3, `fill_blank` ×3, `translate_th_en` ×2, `vocab_match` ×2 | AW1 คำถาม be (Is she …?) · AW2 the + บุพบทบอกที่ · AW3 have/has · FB1 am/is/are (3 ช่อง) · FB2 a/an/the (3 ช่อง) · FB3 this/that/these/those + have/has · TR1 ประโยค be + ครอบครัว/อายุ · TR2 ราคาหรือสี + สิ่งของ · VM1 ครอบครัว + ร่างกาย (5 คู่) · VM2 สี + สิ่งของ (5 คู่) (ตั้ง `strict` ให้ชัดในข้อที่เฉลยเป็นตัวเลขหรือคำย่อ ตามกฎ `answer-forms`) | 13, 20, 27 |

รหัสเสียงที่ต้องมีครบ (ไม่งั้นได้ warning ข้อ 3.1.11): `ae eh ih aa ah ee oo or er ar th dh v w r l z d g` (รหัสที่ `phoneme_intro` ของวัน 1–30 ใช้) และ `s t k` เป็นคู่เทียบ

## 9. ความเสี่ยง
- **R1 ผู้เรียนค้าง:** กันด้วยล็อกที่คำนวณสด (ไม่มีไฟล์ = ไม่ล็อก), สอบจบได้ทุกคะแนน, D15 และลำดับ merge ของ PR 7; มีเทสต์ทุกกิ่งของ `blockingCheckpoint`
- **R2 `router.refresh()` หลังจบ** ทำให้หน้าผลของรอบนี้ถูกแทนด้วยหน้า "ผลล่าสุด" จาก server: ต้องจำสถานะตอน mount + เทสต์ guard (PR 5) ข้อสรุปเรื่องพฤติกรรมของ refresh มาจากการอ่านโค้ดของแผนเล่นซ้ำ ยังต้องพิสูจน์ด้วยการรันบน route ใหม่
- **R3 คิวในหน่วยความจำ:** ปิดแอปขณะออฟไลน์ คำตอบที่ค้างหาย รอบที่ทำต่อถามใหม่ (ไม่เสียคะแนน แต่เสียเวลา) แก้จริงเมื่อมีคิว IndexedDB
- **R4 เครื่องไม่มีเสียงอังกฤษ:** ข้อฟัง/ออกเสียงถูกข้าม = 0 → "ยังไม่ผ่าน" แทบแน่นอน มีแค่คำเตือนบนหน้าเริ่ม (D12) เมื่อมีไฟล์ TTS จริงปัญหานี้หาย
- **R5 แก้ไฟล์ข้อสอบหลังมีคนสอบ:** ผลเก่าถูกตรึง (ไม่เปลี่ยน) แต่รอบค้างที่ทำต่อข้ามไฟล์รุ่นใหม่อาจมีข้อที่ id เปลี่ยน → ข้อใหม่ถูกถาม ข้อที่หายไม่นับ ยอมรับ; ห้ามเปลี่ยนความหมายของ id เดิม (เขียนไว้ใน CONTENT_SCHEMA)
- **R6 E2E ใช้ผู้เรียนร่วมกัน:** สเปกใหม่จบ 30 วัน ต้องรันท้ายสุด (`zz-`); ทางแก้จริงคือฐานข้อมูล `_e2e` แยกต่อสเปก (รายการเดิมใน PLAN) ไม่ทำในงานนี้; Playwright รันได้เฉพาะบน CI
- **R7 ข้อเดิมซ้ำตอนสอบซ้ำ:** คะแนนรอบหลังสูงเกินความสามารถจริงได้ แม้มี D4 และ D5 จึงรายงาน "ดีที่สุด" คู่กับจำนวนรอบ และ CEFR ยังต้องผ่านเกณฑ์คำที่รู้จริงด้วย
- **R8 `checkpoint` เปลี่ยนเป็น `touchesProgress: false`:** ไม่มีข้อมูลเก่าที่ใช้ source นี้ (ไม่มีโค้ดใดส่ง) แต่ผู้ตรวจ PR 2 ต้องยืนยันด้วย `select count(*) from attempts where source = 'checkpoint'` บนฐานข้อมูลจริง = 0 (ผู้ใช้รันเอง)
- **R9 สองคำตอบของข้อเดียวกันใน request เดียว** อาจถูกเก็บเป็น `checkpoint` ทั้งคู่ (เช็ก "เคยตอบ" เห็นเฉพาะแถวที่ commit หรือเขียนก่อนใน transaction เดียวกันตามลำดับ id): ตัวเล่นส่งข้อละครั้ง จึงเกิดได้เฉพาะสองแท็บ ยอมรับ
- **R10 PR 4 แตะ component 12 ตัว:** เป็นการเปลี่ยนแบบเดียวกันทุกไฟล์ กันด้วย `conceal-guard` และเทสต์เดิมของแต่ละ component ที่ต้องผ่านโดยไม่แก้

## 10. สิ่งที่ยืนยันจากโค้ดไม่ได้
- สถานะฐานข้อมูลจริงของผู้ใช้ (`current_day` เลยวัน 31 แล้วหรือยัง; มีแถว `source = 'checkpoint'` หรือไม่) แผนออกแบบให้ปลอดภัยทั้งสองกรณี (D15, R8)
- ไม่มีแบบหน้าจอของแบบทดสอบใน `design/` (`design/README.md` ไม่กล่าวถึง) หน้าเริ่ม/ผล/การ์ดหน้าแรกในแผนนี้เป็นข้อเสนอจากชิ้นส่วนที่มี (`StatusScreen`, `Card`, `buttonClass`) ผู้ใช้ต้องอนุมัติหน้าตาจากภาพจริงหลัง PR 5–6
- วิธีรู้ว่า "เครื่องไม่มีเสียงอังกฤษ" นอกข้อสอบ: เห็นว่ามี `useExerciseAudio` / `AudioFallback` ใน `src/components/audio/AudioControls.tsx` แต่ไม่ได้อ่าน API ละเอียด ผู้ทำ PR 5 ต้องดูว่าใช้บนหน้าเริ่มได้โดยไม่เล่นเสียงหรือไม่ ถ้าไม่ได้ ให้ตัดคำเตือนออกและจดใน PLAN
- `sectionSchema.extend()` ของ Zod รุ่นที่ใช้ คงความ strict หรือไม่ (PR 1 มีเทสต์ยืนยัน ถ้าไม่ ให้ประกาศ `z.strictObject` ใหม่ทั้งก้อน)
- เวลาทำจริง 30 นาทีของโครงข้อ 8 เป็นการประมาณจากจำนวนข้อเทียบกับบทรายวัน (14 ข้อ / 30 นาที รวมเวลาเรียน) ต้องจับเวลาจริงใน PR 7
- ไม่ได้อ่าน `docs/plans/vocab-review-plan.md` และ `m1-lesson-player-plan.md` ทั้งฉบับ (อ่านโค้ดที่ได้จากแผนทั้งสองแทน) และไม่ได้รันแอปหรือเทสต์ใดๆ (งานนี้อ่านอย่างเดียว)

### Critical Files for Implementation
- src/lib/content/schema.ts
- src/lib/content/validate.ts
- src/lib/server/attempts-handler.ts
- src/db/schema.ts
- src/components/player/LessonPlayer.tsx

ไฟล์อื่นที่แผนอ้างบ่อย: src/lib/server/complete-handler.ts, src/lib/progress/sources.ts, src/lib/progress/cefr.ts, src/lib/offline/http-sink.ts, src/components/player/player-state.ts, src/lib/content/rules/context.ts, docs/plans/replay-plan.md (รูปแบบที่แผนนี้ทำตาม)