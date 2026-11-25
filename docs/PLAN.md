# Project Plan

## 1. เป้าหมาย

- **ผู้เรียน:** คนไทยที่เริ่มจากศูนย์ (Pre-A1)
- **ผลลัพธ์หลัง 365 วัน:** ระดับ B1 ถึง B2 คือคุยเรื่องทั่วไปได้คล่อง ฟังพอดแคสต์และอ่านข่าวเข้าใจ เขียนแสดงความเห็นได้
- **เวลาฝึก:** วันละ 30–45 นาที ทุกวัน
- **หลักการสอน:**
  1. ฝึกครบ 4 ทักษะ + การออกเสียงในทุกบทเรียน
  2. ทบทวนซ้ำเป็นระยะด้วย spaced repetition (FSRS)
  3. เน้นเสียงและไวยากรณ์ที่คนไทยมักผิดเป็นพิเศษ
  4. เรียนจาก input ที่เข้าใจได้ (comprehensible input) ก่อน แล้วค่อยให้ผลิตเอง (output)
  5. ทุกคำอธิบายมีภาษาไทยกำกับ และค่อยๆ ลดภาษาไทยลงตามระดับผู้เรียน

## 2. ฟีเจอร์

### Core (ต้องมี)
- **Daily Lesson Player:** เล่นบทเรียนของวันนั้นทีละขั้น (Review → Pronunciation → Listening → Speaking → Reading → Writing)
- **Vocabulary (Oxford 3000):** สอนคำศัพท์หลักของ Oxford 3000 ครบตามระดับ A1–B2 เรียงตามหัวข้อชีวิตประจำวัน (ดู [VOCABULARY.md](VOCABULARY.md))
- **Vocabulary SRS:** คำศัพท์จากบทเรียนเข้าคลังทบทวนอัตโนมัติ ฝึกทั้งความหมาย การนึกคำ การสะกด และการออกเสียง
- **Word Bank:** ดูคำทั้งหมด กรองตามระดับ/หมวด และดูความคืบหน้าเทียบกับ Oxford 3000
- **Audio:** เสียงต้นฉบับจาก TTS ที่สร้างไว้ล่วงหน้า, ปรับความเร็วได้ 0.75x / 1x / 1.25x
- **Record & Compare:** อัดเสียงตัวเองแล้วฟังเทียบกับต้นฉบับ
- **Streak & Calendar:** ไฟ streak, ปฏิทิน heatmap 365 ช่อง, streak freeze

### Advanced
- **Pronunciation Scoring:** ให้คะแนนรายคำและรายเสียงย่อย (phoneme)
- **AI Writing Feedback:** ตรวจงานเขียน แก้ไขให้ และอธิบายเป็นภาษาไทย
- **AI Conversation:** สนทนาแบบบทบาทสมมติตามหัวข้อของบทเรียน
- **Placement Test:** ทดสอบระดับแล้วเลือกวันเริ่มต้นที่เหมาะสม
- **Monthly Checkpoint:** สอบวัดผลทุกสิ้นเดือน ถ้าไม่ผ่านจะได้บทซ่อมเสริม
- **คำนวณพัฒนาการของผู้เรียน:** คำศัพท์ที่รู้จริง (แยกระดับ Oxford), จุดอ่อนที่ต้องแก้ (เสียง คำ ประเภทแบบฝึกหัด ทักษะ) พร้อมบทพัฒนาจุดอ่อนของแต่ละจุด (บทฝึก แล้วตามด้วยบททดสอบ และทดสอบซ้ำอีกวันเพื่อยืนยัน), ระดับ CEFR โดยประมาณ และสถานะเทียบกับแผน 365 วัน สูตรทั้งหมดอยู่ใน [PROGRESS.md](PROGRESS.md)
- **PWA:** ติดตั้งลงมือถือและคอมได้เหมือนแอปจริง, เรียนออฟไลน์ได้ (ดาวน์โหลดบทล่วงหน้า 7 วัน), แจ้งเตือนให้ฝึกด้วย Web Push (ดู [ARCHITECTURE.md](ARCHITECTURE.md#32-pwa))

## 3. Roadmap

### Milestone 0: วางรากฐาน
- [x] เอกสารแผน หลักสูตร สถาปัตยกรรม และ content schema
- [x] นิยามทีม AI (`.claude/agents/`), แผน branch/PR และแนวทาง TDD
- [x] Dockerfile + compose + Makefile ให้ทุกอย่างรันใน Docker
- [x] Scaffold โปรเจกต์ Next.js + TypeScript + Tailwind + Vitest
- [x] Playwright E2E รันผ่านจริงใน Docker บน CI (ครั้งแรก 2026-11-25) บนเครื่อง dev ยังรัน `make e2e` ไม่ได้ เพราะดาวน์โหลด image ของ Playwright ไม่สำเร็จบนเครือข่ายนี้
- [ ] ลอง build image ชุด prod (เขียน stage ไว้แล้ว ยังไม่เคย build)
- [x] Zod schema สำหรับตรวจไฟล์บทเรียนและคลังคำศัพท์ + สคริปต์ `pnpm content:validate`
- [ ] สคริปต์ `pnpm vocab:import` นำเข้ารายการ Oxford 3000/5000 (headword, pos, level) แล้วสร้างโครงคำใน `content/vocab/`
- [ ] จัดคำ Oxford 3000 ทุกคำเข้าหมวด (topic) และวางแผนว่าคำไหนสอนวันที่เท่าไร
- [x] `docker-compose.yml` (PostgreSQL 17), `.env.example`, Drizzle config + migration แรก (schema, `make db-*`, integration test กับ Postgres จริง)
- [x] ตั้ง CI ให้รัน lint, typecheck, test, ตรวจ content, ตรวจ migration และ E2E ทุก PR (`.github/workflows/ci.yml`)

### Milestone 1: MVP (เรียนได้จริง 30 วันแรก)
- [x] Lesson Player ครอบคลุม exercise 13 ประเภทที่ใช้ในสัปดาห์แรก (วันที่ 1–7 เล่นได้ครบทุกข้อ, ล็อกบทตามลำดับ, รอบทวนข้อที่ตอบผิดท้ายบท) ยังไม่ครอบคลุม `roleplay`, `use_in_sentence`, `spell_word` (ไม่มีในวันที่ 1–7 รอ AI tutor/TTS) และยังไม่ได้ลองเล่นในเบราว์เซอร์จริง (ดูหมายเหตุใน PR: เสียงพูด, layout 360px, การโต้ตอบฝั่ง client ตรวจโดย E2E บน CI เท่านั้น)
- [ ] เนื้อหาวันที่ 1–30
- [ ] สคริปต์สร้างเสียง TTS (`pnpm audio:generate`)
- [ ] อัดเสียงด้วย MediaRecorder แล้วฟังเทียบกับต้นฉบับ
- [ ] Vocabulary SRS (FSRS)
- [ ] คลังคำศัพท์ Oxford 3000 ระดับ A1 พร้อมคำแปลไทย ตัวอย่างประโยค และเสียง
- [ ] หน้า Word Bank + หน้ารายละเอียดคำ
- [ ] เก็บความคืบหน้า, attempts, SRS และ streak ลง PostgreSQL (attempts, progress, streak และการล็อกบทต่อกับ UI แล้ว: player ส่งผ่านคิว HTTP ไป `POST /api/attempts` และ `/api/lessons/complete`, หน้าแรกอ่าน `current_day`/streak จาก DB; **ยังขาด:** SRS/`srs_cards` และการนับ streak จากการทบทวนคำ, คิว IndexedDB ออฟไลน์ (ตอนนี้คิวอยู่ในหน่วยความจำ), จึงยังไม่ติ๊ก)
- [ ] เก็บข้อมูลดิบสำหรับคำนวณพัฒนาการตั้งแต่บทแรก: `attempts` ครบทุกช่องรวม `tags` และ `attempt_no` (ต่อกับ UI แล้ว), ประวัติการทบทวนใน `srs_reviews` (ยังไม่ทำ) (ดู [PROGRESS.md](PROGRESS.md) หัวข้อ 1)
- [x] สูตรคำนวณพัฒนาการใน `src/lib/progress/` (คำที่รู้จริง, จุดอ่อน, ระดับ CEFR, ตามแผน 365 วัน) พร้อมเทสต์
- [ ] หน้าสรุปสั้นหลังจบบท: คำใหม่วันนี้, คำที่รู้จริงสะสม, ทันแผนหรือไม่
- [ ] เก็บไฟล์เสียงที่อัดลง `data/recordings/`
- [ ] PWA พื้นฐาน: manifest, ไอคอน, service worker (precache app shell + cache เสียง), ติดตั้งได้, ออกแบบ UI แบบ mobile-first
- [ ] Deploy บนเครื่องตัวเอง: Dockerfile + service `app` ใน compose (profile `prod`), เปิด HTTPS ผ่าน Tailscale, backup `pg_dump` รายวัน (ดู [DEPLOYMENT.md](DEPLOYMENT.md))
  - [ ] prod image ต้อง `COPY` โฟลเดอร์ `content/` เข้าไปด้วย (API ตรวจคำตอบและหน้า `/day/[day]` อ่านบทเรียนจากดิสก์ตอนรัน ที่ `process.cwd()/content`)
  - [ ] เส้นทาง migrate ของ prod: คัดลอก migration เข้า prod image แล้วรันโดยไม่ใช้ tsx (`MIGRATIONS_DIR`, `runMigrations` ใน `src/db/migrate.ts`)

### Milestone 2: บัญชีผู้ใช้และ AI
- [ ] Login ด้วย Better Auth (email + password สำหรับผู้ใช้คนเดียว) เก็บใน PostgreSQL
- [ ] ให้คะแนนการออกเสียง (Azure Pronunciation Assessment)
- [ ] AI ตรวจงานเขียน
- [ ] หน้า "พัฒนาการ" เต็มรูปแบบ: คำศัพท์แยกระดับ, รายการจุดอ่อน, ระดับ CEFR, กราฟย้อนหลัง
- [ ] บทพัฒนาจุดอ่อน: บทฝึก + บททดสอบ + ติดตามสถานะ (ดู [PROGRESS.md](PROGRESS.md) หัวข้อ 3.1)
- [ ] คลังบทฝึกเสียงใน `content/drills/` (อย่างน้อย 24 ข้อต่อเสียง) + schema และกฎตัวตรวจ
- [ ] สอบวัดผลรายเดือน
- [ ] เนื้อหาวันที่ 31–150

### Milestone 3: ครบ 365 วัน
- [ ] AI Conversation
- [ ] Placement test
- [ ] PWA ออฟไลน์เต็มรูปแบบ: ดาวน์โหลดบทล่วงหน้า, คิว IndexedDB + Background Sync
- [ ] Web Push: เตือนฝึกประจำวัน, streak ใกล้หลุด, คำศัพท์ถึงกำหนดทบทวน
- [ ] หน้าสอนวิธีติดตั้งบน iOS
- [ ] เนื้อหาวันที่ 151–365

### Milestone 4: ต่อยอด
- [ ] ระบบแนะนำบทเรียนตามจุดอ่อนของแต่ละคน
- [ ] สถิติย้อนหลังรายปี / สรุปผล 365 วัน

วิธีทำงาน: ทีม AI ตาม [AI_TEAM.md](AI_TEAM.md), branch และ PR ตาม [GIT_WORKFLOW.md](GIT_WORKFLOW.md), พัฒนาแบบ TDD ตาม [TESTING.md](TESTING.md)

## 4. วิธีผลิตเนื้อหา

1. ร่างโครงของแต่ละสัปดาห์ตาม [CURRICULUM.md](CURRICULUM.md)
2. ให้ AI ร่างไฟล์ `day-XXX.json` ตาม [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md)
3. รัน `pnpm content:validate` เพื่อตรวจ schema, ID ซ้ำ และคำศัพท์ที่อ้างถึง
4. คนตรวจทานความถูกต้องและความเป็นธรรมชาติของภาษา
5. รัน `pnpm audio:generate` เพื่อสร้างไฟล์เสียงที่ยังไม่มี
6. Commit ผ่าน PR

## 5. เรื่องที่ยังต้องตัดสินใจ

- ~~ทำใช้เองหรือเปิดให้คนทั่วไปใช้~~ ตัดสินแล้ว: ใช้เองคนเดียว host บนเครื่องตัวเอง (2026-11-24)
- งบค่า API ต่อเดือน
- ภาษาของ UI: ไทยทั้งหมด หรือค่อยๆ เปลี่ยนเป็นอังกฤษตามระดับ
- เงื่อนไขการใช้รายการ Oxford 3000/5000 ของ OUP ถ้าจะเปิดให้คนทั่วไปใช้
- สำเนียงหลักที่จะสอน: US หรือ UK (ตอนนี้วางแผนไว้ให้มีเสียงทั้งสองแบบ)
