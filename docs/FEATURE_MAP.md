# Feature map: หน้าจอและ API ที่มีอยู่

แผนที่สำหรับตรวจการเปลี่ยนแปลงด้วยการรันแอปจริง: แต่ละแถวบอกว่าไปถึงได้อย่างไร, อะไรพิสูจน์ว่าทำงาน และเทสต์ไหนครอบคลุม อัปเดตไฟล์นี้เมื่อเพิ่มหรือเปลี่ยนหน้าจอ/API

เตรียมแอป: `make up` แล้ว `make db-migrate` (ฐานข้อมูล dev ใหม่: `make db-reset CONFIRM=english_zero_to_hero_dev`) เปิด http://localhost:3000 ที่ความกว้าง 360px จบด้วย `make down` ผู้เรียนมีคนเดียว (id `local`) ถูกสร้างเมื่อเปิดหน้าที่อ่านโปรไฟล์ครั้งแรก
ตรวจ DB: `docker compose exec -T postgres psql -U ezh -d english_zero_to_hero_dev -c '...'` (ตาราง `attempts`, `progress`, `streaks`, `activity_days`, `profiles`)

## หน้าจอ

| หน้าจอ | ไปถึงอย่างไร | พิสูจน์ว่าทำงาน | เทสต์ |
|---|---|---|---|
| หน้าแรก `/` | เปิด `/` | HTTP 200; h1 "English Zero to Hero"; "วันที่ N / 365"; "สตรีค X วัน"; ลิงก์เริ่มบทเดียว "เริ่มบทเรียนวันที่ N" → `/day/N` (กับเฟือง "ตั้งค่า"); "วันนี้เรียนแล้ว ✓" เมื่อวันนี้มี activity | `src/app/page.test.tsx`, `src/db/queries/home.int.test.ts`, `e2e/home.spec.ts`, `e2e/lesson.spec.ts` |
| หน้าแรก: เรียนครบ 365 วัน | `progress` วันที่ 365 = done | ข้อความ "เรียนครบ 365 วันแล้ว" ไม่มีลิงก์เริ่มบท | `src/app/page.test.tsx`, `home.int.test.ts` |
| หน้าแรก/วัน: ฐานข้อมูลล่ม | หยุด postgres (`docker compose stop postgres`) แล้วเปิดหน้า | `role=alert` "เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง" + ลิงก์ "ลองใหม่"; ไม่ crash | `src/app/page.test.tsx`, `src/app/(learn)/day/[day]/page.test.tsx`, `src/components/ui/DbErrorScreen.test.tsx` |
| หน้าแรก: ปุ่มตั้งค่า | เปิด `/` | ลิงก์ชื่อ "ตั้งค่า" (ไอคอนเฟือง มุมขวาบน) → `/settings` | `src/app/page.test.tsx` |
| ตั้งค่า `/settings` | กดเฟืองที่หน้าแรก หรือเปิด `/settings` | HTTP 200; h1 "ตั้งค่า"; `radiogroup` "ธีม" มี radio สว่าง / มืด / ตามเครื่อง (ตัวที่ตรงกับ cookie ถูกเลือก); ลิงก์ "← กลับหน้าแรก" → `/` | `src/app/settings/page.test.tsx`, `src/components/ui/ThemePicker.test.tsx` |
| `/today` | เปิด `/today` | HTTP 307 → `/day/<current_day>` | `src/app/today/page.test.tsx` |
| `/day/N` เล่นได้ | `N <= current_day` เช่น `/day/1` | HTTP 200; หัว `h2` "<ชื่อหมวด> ข้อ 1 / M"; คำสั่งไทยของข้อแรกเป็น `h3`; ไม่มี "ยังไม่รองรับ" | `src/app/(learn)/day/[day]/page.test.tsx`, `src/components/exercises/registry.test.tsx` |
| `/day/N` ล็อก | `N > current_day` เช่น `/day/3` เมื่อยังอยู่วันที่ 1 | HTTP 200; h1 "ยังไม่ปลดล็อก"; ลิงก์ "ไปบทเรียนวันที่ <current_day>" | `page.test.tsx` (day), `e2e/lesson.spec.ts` |
| `/day/N` ไม่มีบท | วันที่ยังไม่มีไฟล์ใน `content/lessons/` แต่ปลดล็อกแล้ว | "ยังไม่มีบทเรียนของวันนี้" + ลิงก์หน้าแรก | `page.test.tsx` (day) |
| `/day/007`, `/day/999`, `/day/0` | เปิดตรงๆ | HTTP 404 | `page.test.tsx` (day) |
| Player: ขั้นของ exercise | `/day/1` แล้วทำทีละข้อ | ดูตาราง 13 ประเภทด้านล่าง; แถบล่าง `data-testid="action-bar"` (sticky) มี live region `role=status` + ปุ่ม "ถัดไป" | `src/components/player/LessonPlayer.test.tsx`, `LessonPlayer.guard.test.tsx`, `e2e/lesson.spec.ts` |
| Player: รอบทวน | ตอบข้อที่ตรวจอัตโนมัติผิดอย่างน้อยหนึ่งข้อ แล้วทำจนข้อสุดท้าย | ข้อความ "ทบทวนข้อที่ตอบผิด"; ตัวนับ "ข้อ x / n" เริ่มใหม่; attempt แถว `attempt_no = 2` | `LessonPlayer.test.tsx` |
| Player: หน้าจบบท | ทำครบทุกข้อ (และรอบทวน) | h1 "จบบทเรียนแล้ว"; `done`: "สตรีค X วัน (นานที่สุด Y วัน)" + "คะแนนบทเรียน N%" + ลิงก์ "ไปบทถัดไป" → `/day/<currentDay จาก server>`; `queued`: "จะบันทึกเมื่อออนไลน์" แล้วเปลี่ยนเป็น `done` เมื่อคิวว่าง; `rejected`: `role=alert`; มี "บันทึกไม่สำเร็จ" + "ลองอีกครั้ง" ถ้า request พัง; แถว `progress` day N = done, `streaks.current`, `profiles.current_day` = N+1 | `LessonPlayer.test.tsx`, `DayPlayer.test.tsx`, `src/lib/server/complete-handler.int.test.ts`, `e2e/lesson.spec.ts` |
| คำเตือนคำตอบที่ยังไม่บันทึก | ตัดเน็ตระหว่างเล่นแล้วตอบ | `role=status` "มีคำตอบ N ข้อที่ยังไม่ได้บันทึก อย่าปิดหน้านี้" บนหน้าจบบท/หน้าแรก; `beforeunload` ถูก preventDefault | `src/components/player/UnsavedNote.test.tsx` |

## Exercise 13 ประเภทใน Player (ตัวอย่างจริงใน `content/lessons/day-001..007.json`)

ทุกข้อ: ปุ่ม "ตรวจคำตอบ" อยู่ในเนื้อหา (ไม่แสดงหลังตรวจ); หลังตรวจ แถวล่างแสดง "✓ ถูกต้อง" หรือ "✗ ยังไม่ถูก" + "คำตอบที่ถูกต้อง"; ข้อที่ให้คะแนนไม่ได้แสดง "บันทึกแล้ว" ครั้งเดียว สถานะถูก/ผิดมี `data-state` = `right`/`wrong` และข้อความ sr-only "ถูก"/"ผิด" เสมอ ข้อความอังกฤษมี `lang="en"` (บังคับโดย `a11y-guard.test.tsx`) ถ้าอุปกรณ์ไม่มีเสียง ข้อที่ต้องฟังแสดง "ข้าม" (ไม่บันทึก attempt)

| type | ตัวอย่าง | ทำอย่างไร | selector/ข้อความยืนยัน | เทสต์ |
|---|---|---|---|---|
| `phoneme_intro` | `d001-pron-01` | กด "ถัดไป" | ไม่สร้าง attempt; ปุ่ม "ฟัง"/"ฟังช้า 0.75×" | `PhonemeIntro.test.tsx` |
| `minimal_pair` | `d001-pron-02` | เลือกคำในแต่ละ `radiogroup` "คู่ที่ i" | `role=radio`; ผล `data-state` ต่อคู่ | `MinimalPair.test.tsx` |
| `repeat_after_me` | `d001-pron-03` | "พูดได้"/"ยังไม่คล่อง" | attempt `kind: self`, `score = null` | `RepeatAfterMe.test.tsx`, `ui/SelfRating.test.tsx` |
| `listen_choose` | `d001-listen-01` | เลือกตัวเลือก | `radiogroup` ตามคำถามอังกฤษ | `ListenChoose.test.tsx` |
| `dictation` | `d001-listen-02` | พิมพ์ใน textbox "พิมพ์สิ่งที่ได้ยิน" | `data-state` ของ input + Mark | `Dictation.test.tsx` |
| `shadowing` | `d001-speak-01` | "พูดได้"/"ยังไม่คล่อง" | self rating | `Shadowing.test.tsx` |
| `speak_answer` | `d001-speak-02` | self rating แล้วเห็น "ตัวอย่างคำตอบ" | | `SpeakAnswer.test.tsx` |
| `read_passage` | `d001-read-01` | เลือกคำตอบในแต่ละ `radiogroup` "คำถามที่ i" | ลูกศรเลื่อนตัวเลือกได้ | `ReadPassage.test.tsx` |
| `arrange_words` | `d001-write-01` | แตะแผ่นป้ายใน "คำที่เหลือ" | แผ่นป้ายตัวพิมพ์เล็ก ยกเว้น I/ชื่อเฉพาะ; แถว "คำตอบของคุณ" | `ArrangeWords.test.tsx`, `ui/tile-label` ในนั้น |
| `fill_blank` | `d003-*` | พิมพ์ในช่อง "ช่องว่าง" | `data-state` ต่อช่อง | `FillBlank.test.tsx` |
| `translate_th_en` | `d001-write-02` | พิมพ์ใน "คำแปลภาษาอังกฤษ" | | `TranslateThEn.test.tsx` |
| `free_write` | `d007-write-01` | พิมพ์ถึง `minWords` | ตัวนับคำ; "บันทึกแล้ว" ครั้งเดียว ไม่มีถูก/ผิด | `FreeWrite.test.tsx`, `LessonPlayer.test.tsx` |
| `vocab_match` | `d003-*` | แตะคำอังกฤษ แล้วแตะความหมายไทย | ผลต่อคู่ | `VocabMatch.test.tsx` |

ทุกประเภทต้องลงทะเบียนใน `src/components/exercises/registry.tsx` (`registry.test.tsx` เดินทุกข้อของวันที่ 1–7)

## API

| API | เรียกอย่างไร | พิสูจน์ว่าทำงาน | เทสต์ |
|---|---|---|---|
| `GET /api/health` | `curl -s localhost:3000/api/health` | `{"ok":true}` HTTP 200; ไม่แตะ DB (`select count(*) from "user"` ยังเป็น 0 ถ้ายังไม่เปิดหน้าใด) | `src/app/api/health/route.test.ts` |
| `POST /api/attempts` | body `{"attempts":[AttemptInput...]}` (ดู `src/lib/attempts/contract.ts`) | 200 `{results:[{status:"created"|"duplicate"|"rejected"...}]}`; แถวใน `attempts` ตาม id (ซ้ำ id = แถวเดียว); 400 body ผิด, 415 ไม่ใช่ JSON | `src/lib/server/attempts-handler.int.test.ts`, `src/app/api/routes.test.ts` |
| `POST /api/lessons/complete` | `{"day":1,"sessionId":"<uuid>","completedAt":"<ISO>"}` | 200 `{progress, streak, currentDay}`; เรียกซ้ำได้ผลเดิม; 409 `locked_day` เมื่อวันถูกล็อก; แถว `progress` = done | `src/lib/server/complete-handler.int.test.ts` |

## ธีม (สว่าง / มืด / ตามเครื่อง)

เก็บใน cookie `ezh-theme` (`light` | `dark` | `system`, อายุ 1 ปี, ต่ออุปกรณ์, ไม่อยู่ใน DB) root layout อ่าน cookie บน server แล้วใส่ `data-theme` ที่ `<html>` ทุกหน้า สีมาจากตัวแปร CSS ใน `src/app/globals.css`

| ตรวจอะไร | ทำอย่างไร | พิสูจน์ว่าทำงาน |
|---|---|---|
| มืด | เปิด `/settings` เลือก "มืด" แล้วรีโหลด | `document.documentElement.dataset.theme === "dark"`; cookie `ezh-theme=dark`; `getComputedStyle(document.body).backgroundColor` = `rgb(14, 17, 22)` (#0E1116) |
| สว่าง | เลือก "สว่าง" แล้วรีโหลด | `data-theme="light"`; พื้นหลัง body `rgb(247, 248, 250)` (#F7F8FA) |
| ตามเครื่อง | เลือก "ตามเครื่อง" (หรือยังไม่เคยตั้ง) | `data-theme="system"`; พื้นหลังเป็นสีมืดเมื่อเครื่องตั้ง dark และสีสว่างเมื่อเครื่องตั้ง light (DevTools > Rendering > Emulate prefers-color-scheme) |
| ครั้งแรกที่โหลดไม่กะพริบ | `curl -s -H 'Cookie: ezh-theme=dark' localhost:3000/ \| grep -o '<html[^>]*>'` | `<html lang="th" data-theme="dark">` มากับ HTML แรก ไม่ต้องรอ JS |

เทสต์: `src/app/layout.test.tsx` (cookie → `data-theme`), `src/lib/theme/theme.test.ts`, `src/lib/theme/tokens.test.ts` (ค่าสีตรงตาราง design, dark ใน media query ตรงกับ `[data-theme=dark]`, contrast WCAG AA ทุกคู่ตัวอักษร/พื้นทั้งสองธีม)

## ตรวจโดยเครื่อง (ไม่ต้องจำ)

- `src/lib/theme/color-scan.test.ts`: ห้ามมีสี Tailwind ตรงๆ (`bg-white`, `text-slate-700`), `[#hex]`, hex หรือ `rgb()/hsl()/oklch()` ใน `src/` นอก `src/app/globals.css` (มี self-test ว่าจับตัวอย่างผิดได้) ชุดสีของ Tailwind ถูกลบออกใน `@theme` จึงไม่มี utility สีดิบให้ใช้อยู่แล้ว

- `src/components/exercises/a11y-guard.test.tsx`: ทุก exercise ของวันที่ 1–7 ที่ render ก่อน/หลังผลตรวจ ต้องไม่มีสถานะถูก/ผิดที่สื่อด้วยสีอย่างเดียว และข้อความที่มีตัวอักษรละตินทุกชิ้นต้องอยู่ใต้ `lang="en*"`
- `src/lib/client-safe.test.ts`: โค้ดฝั่ง client (รวม `DayPlayer`, `CompletionScreen`, `registry`) ห้าม import โมดูล server
- `make check` รันทั้งหมด; E2E (`make e2e`) รันบน CI เท่านั้น
