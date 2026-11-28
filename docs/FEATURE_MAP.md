# Feature map: หน้าจอและ API ที่มีอยู่

แผนที่สำหรับตรวจการเปลี่ยนแปลงด้วยการรันแอปจริง: แต่ละแถวบอกว่าไปถึงได้อย่างไร, อะไรพิสูจน์ว่าทำงาน และเทสต์ไหนครอบคลุม อัปเดตไฟล์นี้เมื่อเพิ่มหรือเปลี่ยนหน้าจอ/API

เตรียมแอป: `make up` แล้ว `make db-migrate` (ฐานข้อมูล dev ใหม่: `make db-reset CONFIRM=english_zero_to_hero_dev`) เปิด http://localhost:3000 ที่ความกว้าง 360px จบด้วย `make down` ผู้เรียนมีคนเดียว (id `local`) ถูกสร้างเมื่อเปิดหน้าที่อ่านโปรไฟล์ครั้งแรก
ตรวจ DB: `docker compose exec -T postgres psql -U ezh -d english_zero_to_hero_dev -c '...'` (ตาราง `attempts`, `progress`, `streaks`, `activity_days`, `profiles`)

## หน้าจอ

| หน้าจอ | ไปถึงอย่างไร | พิสูจน์ว่าทำงาน | เทสต์ |
|---|---|---|---|
| หน้าแรก `/` | เปิด `/` | HTTP 200; h1 "English Zero to Hero"; การ์ด "บทเรียนวันนี้": h2 "วันที่ N / 365", ชื่อบท (อังกฤษ `lang="en"` + ไทย) และ "เฟส P · ระดับ" จาก `content/`, แถบ `progressbar` "เรียนแล้ว" (ค่า = วันที่จบแล้ว); ลิงก์เริ่มบทเดียวในหน้า "เริ่มบทเรียนวันที่ N" → `/day/N`; ช่อง "สตรีคต่อเนื่อง" / "สตรีคนานที่สุด" (X วัน) และ "คำที่เรียนแล้ว" (จำนวนคำของบทที่จบแล้ว ไม่ใช่จำนวนใบ; ดูแถว "ทางเข้าทวนคำศัพท์"); แถบเขียว "วันนี้เรียนแล้ว เรียนบทถัดไปต่อได้เลย" เมื่อวันนี้มี activity; ไม่มีข้อมูลที่แอปยังไม่มี (คำที่รู้จริง, คะแนนล่าสุด, ควรฝึกเพิ่ม, ระดับ) | `src/app/(main)/page.test.tsx`, `src/db/queries/home.int.test.ts`, `e2e/home.spec.ts`, `e2e/lesson.spec.ts` |
| หน้าแรก: เรียนครบ 365 วัน | `progress` วันที่ 365 = done | ข้อความ "เรียนครบ 365 วันแล้ว" ไม่มีลิงก์เริ่มบท | `src/app/(main)/page.test.tsx`, `home.int.test.ts` |
| หน้าแรก/วัน: ฐานข้อมูลล่ม | หยุด postgres (`docker compose stop postgres`) แล้วเปิดหน้า | `role=alert` "เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง" + ลิงก์ "ลองใหม่"; ไม่ crash | `src/app/(main)/page.test.tsx`, `src/app/(learn)/day/[day]/page.test.tsx`, `src/components/ui/DbErrorScreen.test.tsx` |
| แถบเมนูหลัก | เปิด `/`, `/practice`, `/progress` หรือ `/settings` (อยู่ใน route group `src/app/(main)/`) | `nav[aria-label="เมนูหลัก"]` เดียว มีลิงก์ 4 อัน: วันนี้ `/`, ฝึกเพิ่ม `/practice`, พัฒนาการ `/progress`, ตั้งค่า `/settings`; ลิงก์ของหน้าปัจจุบันเท่านั้นมี `aria-current="page"` เป็นวงกลมสีเน้นยกเหนือแถบ **ไม่มีชื่อที่มองเห็น** (ชื่อเป็น sr-only) และขอบบนของแถบยุบเว้ารอบวงกลมโดยมีเส้นขอบโค้งตามรอยเว้า (`.nav-notch` + ชั้นตกแต่ง `.nav-ring` `aria-hidden` ใน `globals.css`; ตรวจด้วยตาที่ 360px และ `max-w-md` ทั้ง 4 ตำแหน่ง ทั้งสองธีม); เมนูอื่นมีไอคอน+ชื่อ; ลิงก์สูงอย่างน้อย 44px; เนื้อหาไม่ถูกแถบบัง (padding ล่างใน layout); **ไม่แสดงใน `/day/N`** | `src/components/nav/MainNav.test.tsx`, `src/app/(main)/layout.test.tsx` (เดินทุก `page.tsx` ในกลุ่มอัตโนมัติ), `e2e/nav.spec.ts` (แตะทีละเมนูที่ 360px: URL, heading, ไม่มี horizontal scroll, ปุ่ม >= 44px; `/day/1` ไม่มีแถบ) |
| ฝึกเพิ่ม `/practice` (PR 3b) | แตะ "ฝึกเพิ่ม" ในแถบเมนู | h1 "ฝึกเพิ่ม"; บรรทัดใต้หัว "เล่นทั้งบทจนจบและตอบอย่างน้อยหนึ่งข้อ นับสตรีค · เล่นทีละทักษะไม่นับ · คะแนนเดิมของบทไม่เปลี่ยน"; h2 "เล่นบทที่เรียนแล้วซ้ำ"; ไม่มีวันที่จบ: "ยังไม่มีบทที่เรียนจบ เรียนบทแรกให้จบก่อน" + ลิงก์ "ไปบทเรียนวันนี้" → `/today`; มี: แถว `<details>` ของวันที่จบ ใหม่สุดก่อน ("วันที่ N", ชื่อบท `lang="en"` + ไทย ตัดคำได้, "คะแนน M%" ถ้ามี, ลูกศรหมุนเมื่อกาง) กางแล้วมี "เล่นทั้งบท" → `/day/N` และ "<ชื่อทักษะ> · K ข้อ" → `/day/N?skill=<skill>` ต่อทักษะที่บทมี (ชื่อที่โปรแกรมอ่านจอเห็นต่อท้ายด้วย "วันที่ N" เช่น "เล่นทั้งบท วันที่ 1"); ไฟล์บทหาย: "วันที่ N · ไม่มีเนื้อหา" ไม่มีลิงก์; DB ล่ม: `role=alert` + "ลองใหม่" → `/practice`; ทุกลิงก์/summary สูง >= 44px; การ์ด "ทวนคำศัพท์" อยู่เหนือรายการ (ดูแถว "ทางเข้าทวนคำศัพท์"); ไม่มีจุดอ่อน/ชุด 10 ข้อ/"ประมาณ N นาที" | `src/app/(main)/practice/page.test.tsx` (รวมตรวจ class ตัดคำของชื่อยาว ระดับ class เท่านั้น), `src/app/(main)/layout.test.tsx`, `e2e/replay.spec.ts` (แถววันที่ 1, กาง, ลิงก์ทักษะ, ไม่มี scroll แนวนอนที่ 360px) |
| พัฒนาการ `/progress` (ยังไม่เปิดใช้) | แตะ "พัฒนาการ" ในแถบเมนู | HTTP 200; h1 "พัฒนาการ"; ข้อความ "ยังไม่เปิดใช้ในเวอร์ชันนี้"; ไม่มีปุ่ม/ลิงก์/ช่องกรอก | `src/app/(main)/progress/page.test.tsx` |
| ตั้งค่า `/settings` | แตะ "ตั้งค่า" ในแถบเมนู หรือเปิด `/settings` | HTTP 200; h1 "ตั้งค่า"; `radiogroup` "ธีม" มี radio สว่าง / มืด / ตามเครื่อง (ตัวที่ตรงกับ cookie ถูกเลือก); ไม่มีลิงก์ "กลับหน้าแรก" (ใช้แถบเมนู) | `src/app/(main)/settings/page.test.tsx`, `src/components/ui/ThemePicker.test.tsx` |
| `/today` | เปิด `/today` | HTTP 307 → `/day/<current_day>` | `src/app/today/page.test.tsx` |
| `/day/N` เล่นได้ | `N <= current_day` เช่น `/day/1` | HTTP 200; หัว `h2` "<ชื่อหมวด> ข้อ 1 / M"; คำสั่งไทยของข้อแรกเป็น `h3`; ไม่มี "ยังไม่รองรับ" | `src/app/(learn)/day/[day]/page.test.tsx`, `src/components/exercises/registry.test.tsx` |
| `/day/N` ล็อก | `N > current_day` เช่น `/day/3` เมื่อยังอยู่วันที่ 1 | HTTP 200; h1 "ยังไม่ปลดล็อก"; ลิงก์ "ไปบทเรียนวันที่ <current_day>" | `page.test.tsx` (day), `e2e/lesson.spec.ts` |
| `/day/N` ไม่มีบท | วันที่ยังไม่มีไฟล์ใน `content/lessons/` แต่ปลดล็อกแล้ว | "ยังไม่มีบทเรียนของวันนี้" + ลิงก์หน้าแรก | `page.test.tsx` (day) |
| `/day/007`, `/day/999`, `/day/0`, `/day/1?skill=vocabulary` | เปิดตรงๆ | HTTP 404 + หน้า "ไม่พบหน้านี้" ภาษาไทย (`src/app/not-found.tsx`) มีลิงก์ "กลับหน้าแรก" `/` และ "ไปหน้าฝึกเพิ่ม" `/practice` | `page.test.tsx` (day), `e2e/replay.spec.ts` (`?skill=vocabulary`) |
| `/day/N` เล่นซ้ำทั้งบท (PR 3a) | `progress` วันที่ N = done แล้วเปิด `/day/N` หรือกด "เล่นทั้งบท" ในหน้า `/practice` | ป้าย "เล่นซ้ำ" ในหัวตัวเล่น; ตอบแล้ว attempt เป็น `source=practice` (รวมรอบทวน); จบ → h1 "จบการเล่นซ้ำแล้ว", "คะแนนรอบนี้ N%" (ไม่มีคะแนน: ทีละทักษะ "ส่วนนี้ประเมินตัวเอง ไม่มีคะแนน" ถ้าผู้เรียนประเมินตัวเองในรอบนี้ ไม่งั้น "ส่วนนี้ไม่มีข้อที่ให้คะแนน"; ทั้งบท "รอบนี้ไม่มีข้อที่ให้คะแนน" + สตรีค ถ้ามีคำตอบที่ประเมินตัวเองบันทึกไว้ หรือ "ไม่มีคำตอบที่บันทึกในรอบนี้ จึงไม่นับสตรีค" ถ้าไม่มีเลย), "คะแนนเดิมของบท M% (ไม่เปลี่ยน)", สตรีค; ปุ่ม "เล่นอีกครั้ง" / "กลับไปหน้าฝึกเพิ่ม" → `/practice` / "กลับหน้าแรก"; **ไม่มี** "ไปบทถัดไป"; หน้าจบบทครั้งแรกไม่ถูกแทนที่หลัง `router.refresh()` (โหมดจำตอน mount) **ต้องมี `POST /api/practice/complete` (PR 2) จึงจะเห็นผลจริง** | `LessonPlayer.practice.test.tsx`, `DayPlayer.mode.test.tsx`, `PracticeCompletionScreen.test.tsx`, `player-state.test.ts`, `page.test.tsx` (day), `e2e/replay.spec.ts` (เล่นทั้งบทจาก `/practice`, หน้าแรกไม่เปลี่ยนวัน, 360px) |
| `/day/N?skill=S` เล่นซ้ำทีละทักษะ (PR 3a) | `/day/1?skill=listening` หลังจบวันที่ 1 (S = pronunciation / listening / speaking / reading / writing) | ป้าย "เล่นซ้ำ · ฟัง"; เล่นเฉพาะส่วนนั้น (วันที่ 1 ฟัง = "ข้อ 1 / 2"); หน้าจบมี "ฝึกแยกส่วนไม่นับสตรีค นับเมื่อเล่นทั้งบทจนจบ"; `?skill=vocabulary`/ว่าง/ซ้ำสองค่า/พิมพ์ใหญ่ → 404; ยังไม่จบบท → "ฝึกแยกส่วนได้หลังเรียนบทนี้จบ" + "ไปเรียนบทวันที่ N"; บทไม่มีทักษะนั้น → "บทนี้ไม่มีส่วน<ชื่อทักษะ>" + "กลับไปหน้าฝึกเพิ่ม"; DB ล่ม: ลิงก์ "ลองใหม่" คง `?skill=` | เหมือนแถวบน; `e2e/replay.spec.ts` (`?skill=reading`: ป้าย "เล่นซ้ำ · อ่าน", "ข้อ 1 / 1", หน้าจบ) |
| Player: ขั้นของ exercise | `/day/1` แล้วทำทีละข้อ | ดูตาราง 13 ประเภทด้านล่าง; แถบล่าง `data-testid="action-bar"` (sticky) มี live region `role=status` เสมอ และ **ปุ่มหลักที่เห็นได้มีปุ่มเดียวในแต่ละช่วง:** ก่อนตอบ "ตรวจคำตอบ" (disabled จนมีคำตอบ) หรือปุ่มประเมินตัวเอง, หลังตรวจ/ประเมินแล้ว "ถัดไป" (อยู่ในแถบล่าง, โฟกัสย้ายมาที่ปุ่มนี้; `aria-describedby` ชี้ live region จึงอ่านผลพร้อมชื่อปุ่ม; กดค้าง Enter/Space ไม่ข้าม), `phoneme_intro` มี "ถัดไป" ตั้งแต่ต้น (ไม่มีปุ่มตรวจ) | `src/components/player/LessonPlayer.test.tsx`, `LessonPlayer.guard.test.tsx`, `LessonPlayer.one-action.test.tsx` (ทุกข้อของวันที่ 1–7: ไม่มี "ตรวจคำตอบ" คู่กับ "ถัดไป", โฟกัสหลังตรวจ, Enter ในฟอร์ม, รอบทวน), `e2e/lesson.spec.ts` |
| Player: รอบทวน | ตอบข้อที่ตรวจอัตโนมัติผิดอย่างน้อยหนึ่งข้อ แล้วทำจนข้อสุดท้าย | ข้อความ "ทบทวนข้อที่ตอบผิด"; ตัวนับ "ข้อ x / n" เริ่มใหม่; attempt แถว `attempt_no = 2` | `LessonPlayer.test.tsx` |
| Player: หน้าจบบท | ทำครบทุกข้อ (และรอบทวน) | h1 "จบบทเรียนแล้ว"; `done`: "สตรีค X วัน (นานที่สุด Y วัน)" + "คะแนนบทเรียน N%" + ลิงก์ "ไปบทถัดไป" → `/day/<currentDay จาก server>`; `queued`: "จะบันทึกเมื่อออนไลน์" แล้วเปลี่ยนเป็น `done` เมื่อคิวว่าง; `rejected`: `role=alert`; มี "บันทึกไม่สำเร็จ" + "ลองอีกครั้ง" ถ้า request พัง; แถว `progress` day N = done, `streaks.current`, `profiles.current_day` = N+1 | `LessonPlayer.test.tsx`, `DayPlayer.test.tsx`, `src/lib/server/complete-handler.int.test.ts`, `e2e/lesson.spec.ts` |
| คำเตือนคำตอบที่ยังไม่บันทึก | ตัดเน็ตระหว่างเล่นแล้วตอบ | `role=status` "มีคำตอบ N ข้อที่ยังไม่ได้บันทึก อย่าปิดหน้านี้" บนหน้าจบบท/หน้าแรก; `beforeunload` ถูก preventDefault | `src/components/player/UnsavedNote.test.tsx` |
| ทางเข้าทวนคำศัพท์ (PR 5): `/practice` และหน้าแรก | เปิด `/practice` และ `/` หลังจบวันที่ 1 (การ์ดเริ่มพรุ่งนี้ จึงยังเป็น 0 ใบ); ทำให้ถึงกำหนด: `docker compose exec -T postgres psql -U ezh -d english_zero_to_hero_dev -c "update srs_cards set due = now() - interval '1 hour'"` แล้วเปิดสองหน้าใหม่ | `/practice` การ์ด (section "ทวนคำศัพท์") เหนือ h2 "เล่นบทที่เรียนแล้วซ้ำ": **ถึงกำหนด N ใบ** (N = จำนวน**ใบ** ทั้งสองทิศ = n ของ "x / n" ใน `/review`) + ลิงก์ "เริ่มทวน" → `/review` เมื่อ N > 0; N = 0: "วันนี้ไม่มีคำถึงกำหนดทวน" ไม่มีปุ่ม; ยังไม่มีบทที่จบ: "ยังไม่มีคำให้ทวน เรียนบทแรกให้จบก่อน"; บรรทัดกติกา "ทวนครบทุกใบที่ถึงกำหนด นับสตรีค"; อ่านตัวเลขไม่ได้: "อ่านจำนวนคำที่ถึงกำหนดไม่ได้ ลองเปิดหน้านี้ใหม่" (ไม่แสดงตัวเลข). หน้าแรก: ช่อง "คำที่เรียนแล้ว N" (N = คำของบทที่จบแล้ว; จบวันที่ 1 = 5) ข้างช่องสตรีค และแถวลิงก์ "ทวนคำศัพท์ · ถึงกำหนด N ใบ" → `/review` ใต้การ์ดบทเรียน แสดงเมื่อ N > 0 เท่านั้น (ปุ่มเริ่มบทยังเป็นปุ่มหลักปุ่มเดียว). ตรวจตัวเลขด้วย SQL (ต้องเท่ากับที่หน้าแสดง; `ZONE` = `profiles.timezone`, ปกติ Asia/Bangkok): `select count(*) from srs_cards where user_id='local' and direction in ('en_th','th_en') and due < ((date_trunc('day', now() at time zone 'Asia/Bangkok') + interval '1 day') at time zone 'Asia/Bangkok')` (เฉพาะคำของบทที่จบแล้ว: ถ้ามีการ์ดของคำที่ไม่ได้อยู่ในบทที่จบหรือคำที่ถูกลบจาก content ตัวเลขนี้จะมากกว่าหน้า) และ "คำที่เรียนแล้ว" = `select count(distinct vocab_id) from srs_cards where user_id='local' and direction in ('en_th','th_en')` **ข้อควรระวัง:** SQL นี้นับเกินได้ ถ้ามีการ์ดของคำที่ถูกลบออกจาก content หรือของคำที่ไม่อยู่ในบทที่จบแล้ว (หน้าแสดงเฉพาะคำของบทที่จบ) ถ้ามีการ์ดทิศอื่น (`listen_spell`, `speak`) ต้องกรองด้วย `direction` ตามข้างบน เทียบกับหน้าได้ก็ต่อเมื่อไม่มีคำที่ถูกลบ หลังทวนจบ กด "กลับไปหน้าฝึกเพิ่ม"/"กลับหน้าแรก" ตัวเลขต้องลดลง (หน้า `dynamic = "force-dynamic"`, `staleTimes.dynamic = 0` ของ Next 16) | `src/app/(main)/practice/page.test.tsx`, `src/app/(main)/page.test.tsx`, `src/app/(main)/layout.test.tsx`, `src/lib/srs/cards.int.test.ts` (`getReviewSummary`: เท่ากับ n ของคิว รวมการ์ดของคำที่ไม่อยู่ใน content แล้ว, ขอบเที่ยงคืน, เขตเวลา, ไม่นับการ์ดของผู้เรียนอื่น), `e2e/review.spec.ts` (หน้าแรกและ `/practice` เห็นเลขเท่ากัน ≥ 5, ไม่มีใบถึงกำหนดหลังทวนครบ; ทำให้ถึงกำหนดด้วย `e2e/helpers/due.ts`) |
| ทวนคำศัพท์ `/review` (PR 4: หน้าจอ) | เปิด `/review` หรือกด "เริ่มทวน" ใน `/practice` / ลิงก์ในหน้าแรก (ต้องจบวันที่ 1 ก่อน) ในฐานข้อมูล dev การ์ดใหม่ถึงกำหนดพรุ่งนี้ ให้ทำให้ถึงกำหนดวันนี้ก่อนด้วย `docker compose exec postgres psql -U ezh -d english_zero_to_hero_dev -c "update srs_cards set due = now()"` (ผู้ใช้เป็นคนรันเอง) | ไม่มีเมนูหลัก; หัว "ทวนคำศัพท์" + "1 / N" + แถบความคืบหน้า + ป้าย "อังกฤษ → ไทย"; คำอังกฤษ `lang="en"` + IPA + "ฟัง" / "ฟังช้า 0.75×" + "นึกความหมายให้ออกก่อน แล้วค่อยเปิดดู"; ล่างสุดมีปุ่มเดียว "ดูความหมาย" → คำแปลไทย, ตัวอย่าง en/th, "จำได้แค่ไหน" + 4 ปุ่ม จำไม่ได้/ยาก/ได้/ง่าย (มีระยะใต้ปุ่ม; โฟกัสอยู่ที่ "ได้") และปุ่ม "ดูความหมาย" หายไป; "จำไม่ได้" → ใบนั้นกลับมาหลังอีก 3 ใบ ตัวนับ n ไม่เพิ่ม; **การ์ด `th_en`** (ป้าย "ไทย → อังกฤษ"): หน้าแสดงคำแปลไทยอย่างเดียว ไม่มีคำอังกฤษ/IPA/ปุ่มฟัง, "นึกคำภาษาอังกฤษให้ออกก่อน แล้วค่อยเปิดดู", "ดูคำศัพท์" → คำอังกฤษ + IPA + "ฟัง" / "ฟังช้า 0.75×" + ตัวอย่าง + 4 ปุ่ม; ใบที่ server ปฏิเสธ (บันทึกไม่ได้): กล่องแจ้งที่มองเห็น "บันทึกใบนี้ไม่ได้ จึงข้ามไป" จนกว่าจะให้คะแนนใบถัดไป และโฟกัสย้ายไปหัว "ทวนคำศัพท์" ถ้าใบนั้นเปิดด้านหลังอยู่; หน้าโหลดก่อนเที่ยงคืนแล้วตอบข้อแรกหลังเที่ยงคืน: "จำไม่ได้" ยังกลับมาในรอบนี้ (ใช้วันของคำตอบแรก ดูแผนข้อ 15a); ครบ → h1 "ทวนครบแล้ว" (ถ้ายังเหลือคำถึงกำหนด: h1 "จบรอบนี้แล้ว" + "ยังมีคำถึงกำหนดอีก K ใบ" + "ทวนต่อ"), "ทวน N ใบ", จำนวนต่อปุ่ม, "สตรีค X วัน (นานที่สุด Y วัน)" (ต้องมี API PR 3 แล้ว), ลิงก์ "กลับไปหน้าฝึกเพิ่ม" / "กลับหน้าแรก"; ไม่มีคำถึงกำหนด: "ยังไม่มีคำที่ถึงกำหนดวันนี้"; DB ล่ม: "ลองใหม่" → `/review`; ที่ 360px ปุ่มคะแนน 4 ปุ่มอยู่ในแถวเดียวไม่มีแถบเลื่อนแนวนอน | `src/components/review/*.test.tsx`, `src/components/review/session-state.test.ts`, `src/components/review/eslint-rules.test.ts`, `src/app/(learn)/review/page.test.tsx` (ตรวจใน Chrome ที่ 360px กับ API จริงเมื่อ 2026-11-27: ทวนครบ 10 ใบทั้งสองทิศ; ยังไม่ได้ตรวจ: เสียงจริง, โหมดมืด, มือถือจริง), `e2e/review.spec.ts` (360px: ทั้ง `en_th` และ `th_en` ตั้งแต่ด้านหน้าจนหน้าจบ; ยังไม่เคยรันจริง CI เท่านั้น) |

## Exercise 13 ประเภทใน Player (ตัวอย่างจริงใน `content/lessons/day-001..007.json`)

ทุกข้อ: ปุ่ม "ตรวจคำตอบ" อยู่ในเนื้อหา ที่ล่างสุดของข้อ (ไม่แสดงหลังตรวจ และ "ถัดไป" ยังไม่ปรากฏจนกว่าจะตรวจ); หลังตรวจ แถบล่างติดจอ (พื้นการ์ด+เส้นบน) แสดง "✓ ถูกต้อง" หรือ "✗ ยังไม่ถูก" + "คำตอบที่ถูกต้อง"; ข้อที่ให้คะแนนไม่ได้แสดง "บันทึกแล้ว" ครั้งเดียว สถานะถูก/ผิดมี `data-state` = `right`/`wrong` และข้อความ sr-only "ถูก"/"ผิด" เสมอ ข้อความอังกฤษมี `lang="en"` (บังคับโดย `a11y-guard.test.tsx`) ถ้าอุปกรณ์ไม่มีเสียง ข้อที่ต้องฟังแสดง "ข้าม" (ไม่บันทึก attempt)

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
| `POST /api/attempts` | body `{"attempts":[AttemptInput...]}` (ดู `src/lib/attempts/contract.ts`) | 200 `{results:[{status:"created"|"duplicate"|"rejected"...}]}`; แถวใน `attempts` ตาม id (ซ้ำ id = แถวเดียว); 400 body ผิด, 415 ไม่ใช่ JSON | `src/lib/server/attempts-handler.int.test.ts`, `src/app/api/routes.test.ts` (`source:"practice"`: วันที่ done → `created`; ยังไม่ done → `rejected` `not_finished`; ไม่แตะ `progress`) |
| `POST /api/lessons/complete` | `{"day":1,"sessionId":"<uuid>","completedAt":"<ISO>"}` | 200 `{progress, streak, currentDay}`; เรียกซ้ำได้ผลเดิม; 409 `locked_day` เมื่อวันถูกล็อก; แถว `progress` = done | `src/lib/server/complete-handler.int.test.ts` |
| การ์ดทวนคำศัพท์เกิดจากบทที่จบ (ยังไม่มีหน้าจอ) | จบบทวันที่ N (`POST /api/lessons/complete`) | `select vocab_id, direction, state, due at time zone 'Asia/Bangkok', created_at from srs_cards order by 1, 2` มีทุกคำของบท คำละ 2 แถว (`en_th`, `th_en`), `state=0`, `en_th` `due` = 00:00 พรุ่งนี้ตามเขตเวลา, `th_en` `due` = 00:00 มะรืน; เรียก complete ซ้ำไม่เพิ่มแถว; response ไม่เปลี่ยนรูป; วันที่ยังไม่จบไม่มีการ์ด; ตัวโหลดคิว (`loadReviewQueue`, ใช้โดยหน้า `/review` ใน PR 4) สร้างการ์ดให้บทที่จบก่อนมีฟีเจอร์ | `src/lib/server/complete-handler.int.test.ts`, `src/lib/srs/cards.int.test.ts` |
| `POST /api/practice/complete` | `{"kind":"replay","day":1,"skill":null,"sessionId":"<uuid>","completedAt":"<ISO>"}` | 200 `{session:{sessionId,day,skill,score,graded}, lessonScore, streak, countedForStreak}`; เรียกซ้ำได้ผลเดิม; 409 `not_replayable` (วันยังไม่ done / ไม่มีบท / ไม่มีส่วนนั้น); ไม่มีการเปลี่ยนแถว `progress`/`profiles`; ทั้งบทที่มี attempt practice ของ session นั้นอย่างน้อย 1 รายการเขียน `activity_days(source='practice')` (ไม่มี attempt = `countedForStreak:false`) | `src/lib/server/practice-complete-handler.int.test.ts`, `src/lib/server/practice-guard.int.test.ts`, `src/lib/server/practice-imports.test.ts`, `src/app/api/routes.test.ts` |
| `POST /api/reviews` | `{"reviews":[{"id":"<uuid>","sessionId":"<uuid>","vocabId":"v-hello","direction":"en_th","rating":3,"reviewedAt":"<ISO>"}]}` | 200 `{results:[{id,status:"created",card:{due,stability,difficulty,scheduledDays,learningSteps,elapsedDays,reps,lapses,state,lastReview}}]}`; ส่งซ้ำ id เดิม → `duplicate` + `card` เดิม และ `md5(select * from srs_cards)` ไม่เปลี่ยน; `direction:"th_en"` เปลี่ยนเฉพาะการ์ดทิศนั้น; คำของวันที่ยังไม่จบ → `rejected` `not_taught`; คำที่ไม่มีในคลัง → `unknown_word`; rating 5 → `invalid`; `progress`/`profiles` ไม่เปลี่ยน; `select rating, state_before->>'state', state_after->>'due', session_id from srs_reviews order by reviewed_at desc limit 3` | `src/lib/server/review-handler.int.test.ts`, `src/lib/server/review-imports.test.ts`, `src/lib/srs/stored.test.ts`, `src/app/api/routes.test.ts` |
| `POST /api/reviews/complete` | `{"sessionId":"<uuid>","startedAt":"<ISO>","completedAt":"<ISO>"}` | 200 `{sessionDate, reviewed, remainingDue, streak:{current,longest}, countedForStreak}`; ยังเหลือการ์ดถึงกำหนด (รวมเหลือแค่ `th_en`) หรือไม่มีรีวิวใน session → `countedForStreak:false`; ครบ → `true` และ `select local_date, source from activity_days order by 1 desc` มีวันของรีวิวแรกของ session (ไม่ใช่ `startedAt`: ส่ง `startedAt` ย้อนหลังหรือเก่ามากก็ไม่เปลี่ยนวัน/ไม่ซ่อนการ์ด; มีรีวิวบนการ์ดที่ยังไม่ถึงกำหนดอย่างเดียว = `false`) (`review` ถ้าวันนั้นยังไม่มีกิจกรรมอื่น ไม่งั้นแถวเดิมคงอยู่); เรียกซ้ำผลเดิม; `progress`/`profiles` ไม่เปลี่ยน | `src/lib/server/review-complete-handler.int.test.ts`, `src/lib/server/review-imports.test.ts`, `src/app/api/routes.test.ts` |

## ธีม (สว่าง / มืด / ตามเครื่อง)

เก็บใน cookie `ezh-theme` (`light` | `dark` | `system`, อายุ 1 ปี, ต่ออุปกรณ์, ไม่อยู่ใน DB) root layout อ่าน cookie บน server แล้วใส่ `data-theme` ที่ `<html>` ทุกหน้า สีมาจากตัวแปร CSS ใน `src/app/globals.css`

| ตรวจอะไร | ทำอย่างไร | พิสูจน์ว่าทำงาน |
|---|---|---|
| มืด | เปิด `/settings` เลือก "มืด" แล้วรีโหลด | `document.documentElement.dataset.theme === "dark"`; cookie `ezh-theme=dark`; `getComputedStyle(document.body).backgroundColor` = `rgb(14, 17, 22)` (#0E1116) |
| สว่าง | เลือก "สว่าง" แล้วรีโหลด | `data-theme="light"`; พื้นหลัง body `rgb(247, 248, 250)` (#F7F8FA) |
| ตามเครื่อง | เลือก "ตามเครื่อง" (หรือยังไม่เคยตั้ง) | `data-theme="system"`; พื้นหลังเป็นสีมืดเมื่อเครื่องตั้ง dark และสีสว่างเมื่อเครื่องตั้ง light (DevTools > Rendering > Emulate prefers-color-scheme) |
| ครั้งแรกที่โหลดไม่กะพริบ | `curl -s -H 'Cookie: ezh-theme=dark' localhost:3000/ \| grep -o '<html[^>]*>'` | `<html lang="th" data-theme="dark">` มากับ HTML แรก ไม่ต้องรอ JS |

เทสต์: `src/app/layout.test.tsx` (cookie → `data-theme`), `src/lib/theme/theme.test.ts`, `src/lib/theme/tokens.test.ts` (ค่าสีตรงตาราง design, dark ใน media query ตรงกับ `[data-theme=dark]`, contrast WCAG AA ทุกคู่ตัวอักษร/พื้นทั้งสองธีม, ขอบช่องกรอก `control` >= 3:1)

## จำกัดอุปกรณ์ (`ALLOWED_IPS`)

ปิดเป็นค่าเริ่มต้น (ไม่ตั้ง = ทุกอย่างเหมือนเดิม) ตรวจด้วยแอปจริงโดยไม่แตะ DB: รัน container แยกบนพอร์ตว่าง เช่น `docker compose run --rm --no-deps -e ALLOWED_IPS=100.101.102.103 -p 127.0.0.1:3055:3000 app` แล้ว `curl` จาก host (ใช้ `/api/health` ไม่ต้องใช้ DB)

| ตรวจอะไร | ทำอย่างไร | พิสูจน์ว่าทำงาน |
|---|---|---|
| ปิดฟีเจอร์ | ไม่ตั้ง `ALLOWED_IPS`, `curl -si localhost:3055/api/health` | 200 `{"ok":true}` |
| host เอง (ไม่มี XFF) | ตั้ง `ALLOWED_IPS=100.101.102.103`, `curl -si localhost:3055/api/health` | 200 (peer = gateway ของ Docker bridge ไม่มี XFF = เครื่อง host เอง) |
| อุปกรณ์ที่อนุญาต (จำลอง `tailscale serve`) | `curl -si -H 'X-Forwarded-For: 100.101.102.103' localhost:3055/api/health` | 200 |
| อุปกรณ์ที่ไม่อนุญาต | `curl -si -H 'X-Forwarded-For: 100.200.1.1' localhost:3055/` | 403, `text/html`, h1 "อุปกรณ์นี้ไม่ได้รับอนุญาตให้ใช้แอป", มี `100.200.1.1`; log "[access] denied ip=100.200.1.1 path=/" |
| ทุกเส้นทางถูกบังคับ | ขอ `/_next/static/x.js`, `/api/attempts` (POST), `/ไม่มีหน้านี้` ด้วย XFF ที่ไม่อนุญาต | 403 ทั้งหมด |
| ตั้งค่าผิด | `ALLOWED_IPS='100.101.102.103, oops'` | ทุกคำขอ 500 (รวม `/api/health`), log ขึ้น `invalid entry "oops"`, healthcheck ของ container เป็น unhealthy |

### ใน production stack (stage)

ตั้ง `ALLOWED_IPS` ใน `.env.stage` (เช่น `100.101.102.103, 100.64.0.0/10`) แล้ว `make stage-up` จากนั้น:

| ตรวจอะไร | ทำอย่างไร | พิสูจน์ว่าทำงาน |
|---|---|---|
| ค่าผิดถูกปฏิเสธก่อนเริ่ม | `ALLOWED_IPS=100.101.102.103, oops` แล้ว `make stage-up` | `ERROR: ALLOWED_IPS: invalid entry "oops"` จาก `check-env.sh`, exit ไม่เป็นศูนย์, ไม่มี container ถูกสร้าง |
| ตรวจตัวเอง | `make stage-status` | `access ok: the allow-list is enforced` (เครื่องเอง 200, เลขที่ listed 200, `192.0.2.1` ได้ 403 ที่ `/`, `/api/health`, `/_next/static/...`, header `X-Ezh-Peer` ปลอมได้ 403) |
| container อื่นปลอม XFF | ในผลของ `make stage-status`; หรือมือ: `docker compose -p ezh_stage -f docker-compose.prod.yml --env-file .env.stage exec -T postgres wget -S -O /dev/null --header="X-Forwarded-For: 100.101.102.103" http://app:3000/api/health` | `another container forging X-Forwarded-For ... was refused (403)`; wget `HTTP/1.1 403 Forbidden` (TRUSTED_PROXIES ของ prod = loopback + gateway ของ network เท่านั้น เช่น `127.0.0.0/8, ::1, 172.30.20.1`) |
| header proxy ที่ไม่มีเลข = ไม่ใช่เครื่องเอง | `curl -H 'X-Forwarded-For;' .../api/health` และ `curl -H 'X-Forwarded-Host: x' .../api/health` (ใน `make stage-status` อยู่แล้ว) | 403 ทั้งคู่; curl ธรรมดาจาก host = 200 |
| ปลอม header ของ stamp | `-H 'X-Forwarded-For: 192.0.2.1' -H 'X-Ezh-Xff;'` และ `... -H 'X-Ezh-Xff: <เลขที่ listed>'`; จาก postgres: `X-Ezh-Peer: <gateway>` + `X-Ezh-Xff:` ว่าง | 403 ทั้งหมด (probe เหล่านี้มีเทสต์ว่าล้มจริงถ้าการป้องกันพัง) |
| `APP_BIND` อื่น | `ALLOWED_IPS=...` + `APP_BIND=172.17.0.1` แล้ว `make stage-up` | `check-env.sh` ปฏิเสธ "ALLOWED_IPS works only with APP_BIND=127.0.0.1" |
| เครือข่ายชนกัน | สร้าง network ที่ทับ `172.30.20.0/24` แล้ว `make stage-up` ตอนที่ stack ยังอยู่ subnet เก่า | ข้อความ Thai+English ระบุชื่อ network, แอปยังทำงานอยู่ (ไม่มี `down`) |
| ว่าง = เตือน | `ALLOWED_IPS=` ว่าง แล้ว `make stage-up` / `stage-status` | บรรทัดเตือนสองภาษา "every device on your tailnet can use the app" |
| ย้าย network ครั้งแรก | stack เก่าที่ยังใช้ subnet อื่น แล้ว `make stage-up` | `network ezh_stage_default uses ...; moving it to 172.30.20.0/24`, ข้อมูลอยู่ครบ (ไม่ใช้ `-v`) |
| CI | job `prod-image` | ขั้น "Device allow-list is enforced" ใช้ `scripts/prod/access-check.sh` ตัวเดียวกัน |

เทสต์: `scripts/prod/prod-scripts.test.ts` (ตาราง valid/invalid เดียวกับ `src/lib/access/allowlist-cases.json` ที่ `allowlist.test.ts` ใช้, `access-check.sh`, `net-fix.sh`, compose/Makefile/CI)

เทสต์: `src/lib/access/*.test.ts` (parser/CIDR, การหา client IP, ตัวจำกัด log, peer stamp บน http server จริง), `src/proxy.test.ts` (ไม่มี matcher, ทุก path/method, fail closed, ตรวจตอนสตาร์ท) รายละเอียด: `docs/ARCHITECTURE.md` หัวข้อ 3.0.1

## ตรวจ production stack (`make prod-*`)

ใช้ตรวจว่า image และ stack สำหรับใช้งานจริงทำงานครบ **โดยไม่แตะฐานข้อมูลจริง**: ใช้ project/ฐานข้อมูล/port ทดลองของตัวเอง

```bash
make stage-init     # สร้าง .env.stage (รหัสสุ่ม, POSTGRES_DB=english_zero_to_hero_stage, APP_PORT=3190)
make stage-build
make stage-up
sh scripts/prod/smoke.sh http://127.0.0.1:3190
make stage-down     # เมื่อเสร็จ: ลบชุดทดลองพร้อม volume ezh_stage_pgdata (ไม่มี target ไหนลบ volume ของ prod)
```

| สิ่งที่ตรวจ | วิธี | ควรเห็น |
|---|---|---|
| migration รันก่อนแอป | `make stage-logs` (หรือ `docker compose -p ezh_stage -f docker-compose.prod.yml --env-file .env.stage logs migrate`) | `applied N migration(s)` (รันซ้ำ: `already up to date`); `migrate` สถานะ `Exited (0)` |
| แอป healthy | `make stage-status` | app `(healthy)`; `{"ok":true}` |
| หน้าหลัก | `curl` `/`, `/day/1`, `/practice`, `/review`, `/settings` | 200; `/` มี "English Zero to Hero"; `/day/1` มี "ข้อ 1 / 10" (บทเรียนอ่านจาก `content/` ใน image ได้) |
| stage แยกจากแอปจริง | `docker compose -p ezh_stage ... config --images` เทียบกับ prod; `make -n stage-backup` | stage ใช้ image ของตัวเอง (ezh-stage-app) ไม่ทับ image ของแอปจริง (ezh-prod-app) และ backup ลง `backups-stage/` |
| round trip จริง | `make stage-roundtrip` (หรือ `make ci-roundtrip` ใน CI) **ห้ามรันกับแอปจริง (prod) เด็ดขาด ใช้กับ stage หรือ CI เท่านั้น** สคริปต์ปฏิเสธเป้าหมายอื่นเอง | marker 7 → 42 หลัง restore; dump ที่ใหม่กว่าถูกปฏิเสธและข้อมูลไม่เปลี่ยน; จบด้วย `ROUNDTRIP OK` |
| เป็น production build | `curl -s / \| grep -c hot-reloader` | 0 (ไม่มี dev HMR) |
| ฟอนต์ self-host | ดึง `url(../media/*.woff2)` จาก CSS ที่ `/_next/static/media/` | 200 `Content-Type: font/woff2` |
| ไม่รัน root | `docker exec <app> id` | `uid=1000(node)` |
| backup/restore | จบบทวัน 1 ด้วย `POST /api/lessons/complete` → `make stage-backup` → `make stage-backup-verify FILE=...` → ล้างตาราง → `make stage-restore FILE=... CONFIRM=english_zero_to_hero_stage` (จบด้วย migration + แอป healthy) | ไฟล์ `.dump` เจ้าของ uid 1000; `progress` done=1 และ `srs_cards`=10 กลับมา |
| ล้างทดลอง | `make stage-down` | volume ของ dev (`english_zero_to_hero_pgdata`) และ prod (`ezh_prod_pgdata`) ไม่ถูกแตะ |

เทสต์: `scripts/prod/prod-scripts.test.ts` (ตรวจรหัสผ่าน, backup/restore/prune/verify/pre-update, ต้องมี `CONFIRM`, ห้าม `-v` กับ prod), `src/db/migration-safety.test.ts` (migration ที่ลบข้อมูลต้องมี `-- destructive: reviewed`), job `prod-image` ใน CI

## Backup อัตโนมัติรายวัน (`make prod-backup-auto-*`)

ตรวจกับ stack ทดลอง: `make stage-up`, แล้ว `make stage-backup-auto-run` (สคริปต์เดียวกับที่ systemd timer รัน), ล้างด้วย `make stage-down`

| ตรวจอะไร | ทำอย่างไร | พิสูจน์ว่าทำงาน |
|---|---|---|
| backup + ตรวจกู้คืน | `make stage-backup-auto-run` | ไฟล์ `backups-stage/ezh-<db>-<เวลา UTC>-auto.dump` (สิทธิ์ 600), `data/backup-auto-stage.state` = `result=ok`, log "backup ok ... verified by restoring it into a scratch database", ไม่เหลือฐานข้อมูล `ezh_verify_*` |
| ไม่เกินวันละครั้ง | สั่งซ้ำทันที | `SKIP: the newest backup (...) is 0 hours old; a new automatic one is taken after 22 hours` ไม่มีไฟล์ใหม่ (backup ชนิดใดก็นับ) |
| stack ไม่ทำงาน | `docker compose ... stop app postgres` แล้วสั่ง | `SKIP: the production stack is not running`, exit 0, ไม่มี container ถูกเปิด |
| ล้มเหลวต้องเห็น | ทำให้โฟลเดอร์ backup ใช้ไม่ได้ (มีไฟล์ชื่อเดียวกันขวางอยู่) แล้วสั่ง | exit 1, `data/backup-auto-stage.state` = `result=FAILED`, log, และ `make stage-status` ขึ้น `WARNING: last automatic backup FAILED at ...`; ครั้งถัดไปที่สำเร็จคำเตือนหาย |
| หน้าต่างแยก | `BACKUP_KEEP_AUTO=2` + `make stage-backup` + สั่งอัตโนมัติ 3 ครั้ง | เหลือ `-auto` 2 ไฟล์ ไฟล์ manual อยู่ครบ |
| hook ใน prod-up | `make stage-up AUTO_ON_UP=1` (ค่าเริ่มต้น: เฉพาะแอปจริง) | backup ใหม่เมื่อล่าสุดเก่ากว่า 22 ชม. เท่านั้น; prod-up ซ้ำไม่ backup ซ้ำ |
| คำเตือน 3 วัน | `make prod-status` / `stage-status` เมื่อ backup ล่าสุดเก่ากว่า 3 วัน หรือไม่มีเลย | `WARNING: the newest backup is older than 3 days` / `no backup at all` พร้อมข้อความไทย |
| systemd จริง | render unit ชื่อ `ezh-stage-test-backup` (`sh scripts/prod/auto-backup-install.sh render ezh_stage ~/.config/systemd/user ezh-stage-test-backup`) แล้ว `systemctl --user start ...` / `enable --now ...timer` แล้วลบออกให้หมด | `status` = inactive (dead) เมื่อ skip, log "backup ok" เมื่อสำเร็จ, `failed (Result: exit-code)` เมื่อล้มเหลว, `list-timers` เห็นรอบถัดไป; ทำงานกับ path ที่มีช่องว่าง |
| ติดตั้งจริงเฉพาะ prod | `make stage-backup-auto-install` | ปฏิเสธ: "only for the real production project ezh_prod" |

เทสต์: `scripts/prod/auto-backup.test.ts` (ข้าม/ล้มเหลว/หน้าต่าง/ล็อก/สถานะ/ตัวติดตั้ง/Makefile), `scripts/prod/prod-scripts.test.ts` (prune เดิมไม่เปลี่ยน)

## ตรวจโดยเครื่อง (ไม่ต้องจำ)

- `src/lib/theme/color-scan.test.ts`: ห้ามมีสี Tailwind ตรงๆ (`bg-white`, `text-slate-700`), `[#hex]`, hex หรือ `rgb()/hsl()/oklch()` ใน `src/` นอก `src/app/globals.css` (มี self-test ว่าจับตัวอย่างผิดได้) ชุดสีเริ่มต้นของ Tailwind ถูกลบใน `@theme` (utility สีดิบอย่าง `bg-white` จึงไม่สร้าง CSS) แต่ค่า arbitrary (`bg-[#fff]`, `bg-[red]`) ยังแสดงผลได้ ตัวตรวจจึงเป็นสิ่งที่กันไว้ และตรวจอีกทิศด้วย: class สีทุกตัวต้องเป็น token จริงหรือ utility ที่ไม่ใช่สีที่ระบุไว้ชัด (กัน token ที่พิมพ์ผิด เช่น `text-primary`) รวม `style={{ color }}` และ `fill=`/`stroke=` ที่เป็นค่าตรงๆ ข้อจำกัด: class ที่ประกอบจากสตริง (`"bg-" + x`) และค่าที่เป็นตัวแปรตรวจไม่ได้

- `src/app/(main)/layout.test.tsx`: ทุก `page.tsx` ใต้ `src/app/(main)/` ต้อง render ในแถบเมนูหลักที่มีลิงก์ `aria-current="page"` ตรงกับ route เพียงอันเดียว และ `/day/[day]` ต้องไม่มีแถบ (เพิ่มหน้าในกลุ่ม = ได้แถบ + ถูกตรวจเอง)
- `src/components/exercises/control-border.test.ts`: `<input>`/`<textarea>` ของ exercise ต้องใช้ขอบ `border-control` (หรือ `fieldToneClass`) ไม่ใช่ `border-line`; `tokens.test.ts` บังคับ `control` >= 3:1 กับ bg/card/surface ทั้งสองธีม
- `src/components/exercises/touch-targets.test.tsx`: ทุก `button`/`a`/`input`/`textarea`/`[role=radio]` ของ exercise วันที่ 1–7 (ก่อนและหลังผลตรวจ) ต้องมี class สูง >= 44px (`min-h-11` ขึ้นไป); อ่านจาก class เพราะ jsdom ไม่มี layout จึงไม่ได้วัดขนาดจริง (ขนาดจริงตรวจด้วย `e2e/nav.spec.ts` สำหรับเมนู และด้วยตาในเบราว์เซอร์สำหรับแบบฝึกหัด)
- `src/components/exercises/a11y-guard.test.tsx`: ทุก exercise ของวันที่ 1–7 ที่ render ก่อน/หลังผลตรวจ ต้องไม่มีสถานะถูก/ผิดที่สื่อด้วยสีอย่างเดียว และข้อความที่มีตัวอักษรละตินทุกชิ้นต้องอยู่ใต้ `lang="en*"`
- `src/lib/client-safe.test.ts`: โค้ดฝั่ง client (รวม `DayPlayer`, `CompletionScreen`, `registry`, `ReviewApp`, `ReviewSession`) ห้าม import โมดูล server
- `make check` รันทั้งหมด; E2E (`make e2e`) รันบน CI เท่านั้น
