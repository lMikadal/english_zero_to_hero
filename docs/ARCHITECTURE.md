# Architecture

## 1. หลักการ

- **Content as code:** เนื้อหาทั้งหมดอยู่ใน `content/` เป็น JSON ตรวจด้วย Zod schema ตอน build และใน CI
- **DB เก็บเฉพาะข้อมูลผู้ใช้:** ความคืบหน้า, SRS state, คะแนน, เสียงที่อัด
- **เสียงต้นฉบับสร้างล่วงหน้า:** สคริปต์อ่าน content แล้วสร้างเสียง TTS ที่ยังไม่มี โดยตั้งชื่อไฟล์ตาม hash ของข้อความ (ข้อความเดิมจึงไม่ต้องสร้างใหม่)
- **Type-safe ตลอดสาย:** Zod schema → TypeScript types → UI component

## 2. Tech Stack

| ส่วน | เลือกใช้ |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Validation | Zod |
| Database | **PostgreSQL 17** (รันใน Docker) + Drizzle ORM + drizzle-kit migrations |
| Auth | Better Auth (เก็บ user/session ใน Postgres ผ่าน Drizzle adapter) |
| File storage | เก็บเสียงที่อัดเป็นไฟล์บนดิสก์ของเครื่อง (`data/recordings/`, mount เป็น volume) |
| Hosting | เครื่องของผู้ใช้เอง ผ่าน Docker Compose + Tailscale (ดู [DEPLOYMENT.md](DEPLOYMENT.md)) |
| SRS | `ts-fsrs` |
| TTS | Azure TTS หรือ OpenAI TTS (ใช้ผ่านสคริปต์เท่านั้น) |
| Pronunciation scoring | Azure Speech Pronunciation Assessment |
| STT | Whisper / Azure STT |
| AI Tutor | Claude API (เรียกจาก server route เท่านั้น) |
| PWA | Web App Manifest (`app/manifest.ts`) + Service Worker ด้วย Serwist (`@serwist/next`) |
| Offline storage | IndexedDB (ผ่าน `idb`) สำหรับบทเรียนที่ดาวน์โหลดไว้และคิวข้อมูลที่รอส่ง |
| Push notification | Web Push (VAPID) + ไลบรารี `web-push` ฝั่ง server |
| Test | Vitest + Testing Library + Playwright พัฒนาแบบ TDD (ดู [TESTING.md](TESTING.md)) |
| Package manager | pnpm |

## 3. โครงสร้างโฟลเดอร์

```
english_zero_to_hero/
├── content/
│   ├── lessons/            # day-001.json ... day-365.json
│   ├── vocab/              # คลังคำศัพท์ Oxford 3000/5000 แยกตามระดับ (ดู VOCABULARY.md)
│   ├── phonemes.json       # ข้อมูล IPA + คู่คำ minimal pair
│   └── checkpoints/        # ข้อสอบรายเดือน
├── public/
│   ├── audio/              # ไฟล์ TTS ที่สร้างแล้ว (<hash>.mp3)
│   └── icons/              # ไอคอน PWA (192, 512, maskable, apple-touch-icon)
├── scripts/
│   ├── validate-content.ts # pnpm content:validate
│   └── generate-audio.ts   # pnpm audio:generate
├── src/
│   ├── app/                # Next.js routes
│   │   ├── manifest.ts          # Web App Manifest
│   │   ├── sw.ts                # Service Worker (Serwist)
│   │   ├── ~offline/            # หน้าที่แสดงเมื่อออฟไลน์และยังไม่มี cache
│   │   ├── (learn)/day/[day]/   # Lesson Player
│   │   ├── review/              # SRS
│   │   ├── words/               # Word Bank + หน้ารายละเอียดคำ
│   │   ├── pronunciation/       # Pronunciation Lab
│   │   ├── progress/            # Dashboard
│   │   └── api/                 # AI, scoring, STT
│   ├── components/
│   │   └── exercises/      # 1 component ต่อ exercise type
│   ├── lib/
│   │   ├── content/        # schema.ts, loader.ts
│   │   ├── srs/
│   │   ├── audio/
│   │   ├── ai/
│   │   ├── storage/        # เก็บไฟล์เสียงที่อัดลงดิสก์ (data/recordings)
│   │   ├── offline/        # IndexedDB, คิว sync, ดาวน์โหลดบทล่วงหน้า
│   │   └── push/           # สมัครและส่ง Web Push
│   └── db/
│       ├── schema.ts       # Drizzle schema (แหล่งความจริงของโครงสร้างตาราง)
│       ├── client.ts       # Postgres connection (postgres.js)
│       └── migrations/     # SQL ที่ drizzle-kit generate ออกมา (commit ลง git)
├── data/                   # ข้อมูลบนเครื่อง (ไม่ commit): recordings/, backups/
├── e2e/                    # Playwright tests
├── Dockerfile              # image ของแอป (dev + prod)
├── docker-compose.yml      # app + postgres (+ e2e)
├── Makefile                # คำสั่งลัดทั้งหมด (เรียก docker compose)
├── drizzle.config.ts
├── .env.example            # รายการ env ที่ต้องตั้ง (ห้าม commit .env)
└── docs/
```

## 3.0 Docker-first

**ทุกอย่างของแอปรันใน Docker** เครื่อง host ต้องมีแค่ Docker กับ git ไม่ต้องติดตั้ง Node, pnpm หรือ PostgreSQL

| Service | Image | หน้าที่ |
|---|---|---|
| `app` | สร้างจาก `Dockerfile` (Node LTS + pnpm) | Next.js: โหมด dev มี hot reload โดย mount โค้ดเข้าไป, โหมด prod ใช้ production build |
| `postgres` | `postgres:17-alpine` | ฐานข้อมูล (มีฐานข้อมูลแยกสำหรับเทสต์) |
| `e2e` | Playwright image | รัน E2E test (เปิดเฉพาะตอนสั่งเทสต์) |

คำสั่งทั้งหมดเรียกผ่าน `make` ซึ่งไปสั่ง `docker compose` อีกที:

| คำสั่ง | ทำอะไร |
|---|---|
| `make up` / `make down` | เปิด / ปิดแอปโหมด dev ที่ `http://localhost:3000` |
| `make test` | รัน unit + component + integration test |
| `make e2e` | รัน Playwright |
| `make check` | lint + typecheck + test + content:validate (ต้องผ่านก่อนเปิด PR) |
| `make validate` | ตรวจไฟล์ใน `content/` |
| `make db-generate` / `make db-migrate` | สร้าง / รัน migration |
| `make db-studio` | เปิด Drizzle Studio |
| `make db-reset` | ล้างฐานข้อมูล dev แล้ว migrate ใหม่ |
| `make audio` | สร้างไฟล์เสียง TTS ที่ยังไม่มี |
| `make sh` | เปิด shell ใน container `app` |
| `make prod` | build และรันโหมดใช้งานจริง |

ชื่อสคริปต์แบบ `pnpm xxx` ที่เอกสารอื่นพูดถึง คือสคริปต์ใน `package.json` ที่รัน**ภายใน container** เท่านั้น

## 3.1 Database (PostgreSQL)

- **Dev:** `make up` จะรัน Postgres คู่กับแอป (เปิด port เฉพาะ `127.0.0.1:5432`)
- **Connection:** ภายใน Docker ใช้ `DATABASE_URL=postgres://ezh:ezh@postgres:5432/english_zero_to_hero`
- **Migrations:** แก้ `src/db/schema.ts` แล้วรัน `make db-generate` เพื่อสร้าง SQL จากนั้นรัน `make db-migrate` ห้ามแก้ตารางด้วยมือ
- **ใช้งานจริง:** รันบนเครื่องของผู้ใช้เอง ดู [DEPLOYMENT.md](DEPLOYMENT.md)
- **Backup:** `pg_dump` รายวันลง `data/backups/`

## 3.2 PWA

เป้าหมายคือให้ติดตั้งลงมือถือ (Android, iOS) และคอมได้เหมือนแอปจริง ฝึกได้ทุกวันแม้ไม่มีเน็ต

**Manifest** (`src/app/manifest.ts`)
- `name: "English Zero to Hero"`, `short_name: "EZH"`, `display: "standalone"`, `start_url: "/today"`, `lang: "th"`
- ไอคอน 192/512 px + maskable และ `apple-touch-icon` สำหรับ iOS
- `shortcuts`: "บทเรียนวันนี้" (`/today`) และ "ทบทวนคำศัพท์" (`/review`)

**Service Worker cache strategy**

| ทรัพยากร | Strategy | หมายเหตุ |
|---|---|---|
| App shell (JS, CSS, fonts, icons) | Precache | Serwist สร้างรายการให้ตอน build |
| หน้า HTML | Network-first, fallback cache → `/~offline` | |
| บทเรียน JSON | Stale-while-revalidate | |
| ไฟล์เสียง TTS `/audio/<hash>.mp3` | Cache-first | ชื่อไฟล์เป็น hash จึง cache ได้ถาวร |
| API (`/api/*`) | Network-only | ถ้าออฟไลน์ ให้เข้าคิวใน IndexedDB |

**ใช้งานออฟไลน์**
- เมื่อออนไลน์ แอปจะ**ดาวน์โหลดบทเรียน 7 วันถัดไป** (JSON + เสียง) และคำศัพท์ที่ถึงกำหนดทบทวนเก็บไว้ล่วงหน้า
- ผลการทำแบบฝึก (attempts), การทบทวน SRS และไฟล์เสียงที่อัด จะเก็บไว้ในคิว IndexedDB แล้วส่งขึ้น server เมื่อกลับมาออนไลน์ (ใช้ Background Sync ถ้าเบราว์เซอร์รองรับ ถ้าไม่รองรับจะส่งตอนเปิดแอป)
- ทุกรายการในคิวมี `client_id` (uuid) เพื่อให้ server ไม่บันทึกซ้ำ
- ฟีเจอร์ที่ต้องใช้เน็ต (AI Tutor, ให้คะแนนการออกเสียง) จะแสดงว่า "ต้องใช้อินเทอร์เน็ต" และเก็บเสียงไว้ส่งตรวจทีหลังได้

**แจ้งเตือน (Web Push)**
- ผู้ใช้เลือกเวลาเตือนฝึกเอง (เช่น 20:00) cron ฝั่ง server จะส่ง push ตาม timezone ของแต่ละคน
- ประเภทการแจ้งเตือน: เตือนฝึกประจำวัน, streak ใกล้หลุด, คำศัพท์ถึงกำหนดทบทวน
- iOS ส่ง push ได้เฉพาะเมื่อ**ติดตั้งลงหน้าจอโฮมแล้ว** (iOS 16.4 ขึ้นไป) แอปจึงต้องมีหน้าสอนวิธีติดตั้งบน iOS

**การติดตั้ง**
- Android/Desktop: ดักจับ `beforeinstallprompt` แล้วแสดงปุ่ม "ติดตั้งแอป" หลังเรียนจบบทแรก
- iOS: แสดงคำแนะนำ "แชร์ → เพิ่มไปยังหน้าจอโฮม"

**ข้อควรรู้**
- อัดเสียง (MediaRecorder) ใน PWA ใช้ได้ทุกแพลตฟอร์ม แต่ iOS Safari จะได้ไฟล์ `audio/mp4` แทน `audio/webm` ฝั่ง server ต้องรองรับทั้งสองแบบ
- Service Worker และไมโครโฟนต้องใช้ HTTPS (ยกเว้น `localhost`)
- ทดสอบด้วย Lighthouse PWA audit ใน CI

## 4. Data Model (ข้อมูลผู้ใช้)

```
-- Better Auth จัดการเอง: user, session, account, verification

profiles       user_id PK→user, display_name, start_date date, current_day int, timezone text, accent(us|uk)
progress       user_id, day int, status enum(not_started|in_progress|done), score real, completed_at timestamptz
               PK(user_id, day)
attempts       id uuid PK (สร้างฝั่ง client เพื่อกันบันทึกซ้ำตอน sync), user_id, exercise_id text, correct bool, score real, answer jsonb, created_at timestamptz
               INDEX(user_id, created_at), INDEX(user_id, exercise_id)
srs_cards      user_id, vocab_id text, direction enum(en_th|th_en|listen_spell|speak),
               due timestamptz, stability real, difficulty real, reps int, lapses int, state smallint, last_review timestamptz
               PK(user_id, vocab_id, direction), INDEX(user_id, due)
recordings     id uuid PK, user_id, exercise_id text, object_key text, pron_score jsonb, created_at timestamptz
streaks        user_id PK, current int, longest int, last_active_date date, freezes_left int
push_subscriptions  id uuid PK, user_id, endpoint text UNIQUE, p256dh text, auth text, created_at timestamptz
reminder_settings   user_id PK, enabled bool, remind_at time, types text[]
```

- `user_id` ทุกตารางเป็น FK ไปที่ `user.id` แบบ `ON DELETE CASCADE`
- `jsonb` ใช้เก็บข้อมูลที่โครงสร้างต่างกันตาม exercise type (คำตอบ, คะแนนการออกเสียงรายเสียง)
- `object_key` คือ path ของไฟล์ใน `data/recordings/` ไม่ได้เก็บไฟล์เสียงใน Postgres

`exercise_id` และ `vocab_id` เป็น ID แบบ string ที่กำหนดไว้ในไฟล์ content (เช่น `d001-pron-01`) จึงผูกกับ git ได้โดยตรง

## 5. Flow ของ Lesson Player

1. `loader.ts` อ่าน `content/lessons/day-XXX.json` แล้วตรวจกับ schema
2. หน้า `/day/[day]` render ทีละ section ทีละ exercise
3. แต่ละ exercise ส่งผลลัพธ์ไปที่ `attempts`
4. เมื่อจบบท จะอัปเดต `progress` และ `streaks` แล้วเพิ่มคำศัพท์ของบทเข้า `srs_cards`
