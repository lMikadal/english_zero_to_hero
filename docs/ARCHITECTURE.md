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
| `app` | สร้างจาก `Dockerfile` target `dev` (Node 26 LTS + pnpm 12) | Next.js: โหมด dev มี hot reload โดย mount โค้ดเข้าไป (`node_modules` และ `.next` อยู่ใน named volume, รันเป็น uid 1000, เปิด port ที่ `127.0.0.1:3000` เท่านั้น); target `prod` (standalone build) มีใน Dockerfile แล้ว แต่ compose profile `prod` ทำใน PR 13 |
| `postgres` | `postgres:17-alpine` | ฐานข้อมูล (มีฐานข้อมูลแยกสำหรับเทสต์) |
| `e2e` | `mcr.microsoft.com/playwright` (เวอร์ชันตรงกับ `@playwright/test`) | รัน E2E test (compose profile `e2e` เปิดเฉพาะตอนสั่งเทสต์) เข้าถึงแอปที่ `http://e2e-target:3000` ในเครือข่ายของ compose (ไม่ใช้ชื่อ `app` เพราะ Chromium บังคับ https กับชื่อนี้) |

คำสั่งทั้งหมดเรียกผ่าน `make` ซึ่งไปสั่ง `docker compose` อีกที:

| คำสั่ง | ทำอะไร |
|---|---|
| `make up` / `make down` | เปิด / ปิดแอปโหมด dev ที่ `http://localhost:3000` |
| `make test` | รัน unit + component + integration test (เปิด Postgres ให้เองถ้ายังไม่รัน ไม่ต้อง `make up`) |
| `make test-unit` | รันเฉพาะ unit + component (ไม่ต้องใช้ฐานข้อมูล) |
| `make e2e` | รัน Playwright |
| `make check` | lint + typecheck + test + validate ต้องผ่านก่อนเปิด PR ไม่รวม e2e |
| `make lint` / `make typecheck` / `make logs` | ESLint / `tsc --noEmit` / ดู log ของ app |
| `make validate` | ตรวจไฟล์ทั้งหมดใน `content/` (`pnpm content:validate`: schema + กฎข้ามไฟล์ ดู [VOCABULARY.md](VOCABULARY.md#6-กฎการตรวจ-pnpm-contentvalidate)) |
| `make db-generate` / `make db-migrate` | สร้าง SQL migration จาก `src/db/schema.ts` / สร้างฐานข้อมูล dev ถ้ายังไม่มี แล้วรัน migration (บอกว่า "applied N" หรือ "already up to date") |
| `make db-studio` | เปิด Drizzle Studio (port `127.0.0.1:4983`, เปิดผ่าน https://local.drizzle.studio) |
| `make db-reset CONFIRM=<ชื่อ db>` | **dev เท่านั้น** drop + สร้างฐานข้อมูล dev ใหม่ แล้ว migrate ป้องกันด้วย 2 ชั้น: (1) ปฏิเสธทุกฐานข้อมูลที่ชื่อไม่ลงท้าย `_dev` (ไม่สนใจ host หรือ `NODE_ENV`) จึงแตะฐานข้อมูลจริง `english_zero_to_hero` ไม่ได้ (2) ต้องพิมพ์ชื่อฐานข้อมูลใน `CONFIRM=` ให้ตรง เช่น `make db-reset CONFIRM=english_zero_to_hero_dev` ถ้าไม่พิมพ์จะบอกว่าต้องพิมพ์อะไรแล้วออกด้วย exit code ไม่เป็นศูนย์ ตรวจก่อนเปิด Postgres (ฟังก์ชัน `assertResettable` ใน `src/db/admin.ts`) |
| `make audio` | สร้างไฟล์เสียง TTS ที่ยังไม่มี |
| `make sh` | เปิด shell ใน container `app` |
| `make prod` | build และรันโหมดใช้งานจริง |

คำสั่งที่ฟีเจอร์ยังไม่มี (`audio`, `prod`) จะแจ้งว่า "not implemented yet (PR n)" และออกด้วย exit code ไม่เป็นศูนย์ จนกว่า PR นั้นจะ merge

ชื่อสคริปต์แบบ `pnpm xxx` ที่เอกสารอื่นพูดถึง คือสคริปต์ใน `package.json` ที่รัน**ภายใน container** เท่านั้น

## 3.1 Database (PostgreSQL)

- **Dev:** `make up` จะรัน Postgres คู่กับแอป (เปิด port เฉพาะ `127.0.0.1:5432`) และสร้างฐานข้อมูล dev ให้ถ้ายังไม่มี
- **แยกฐานข้อมูล dev กับของจริง:** ใน Postgres instance เดียว (compose project และ volume `pgdata` เดียวกัน ทั้ง dev และ prod) มี 3 ฐานข้อมูล: `english_zero_to_hero` = **ของจริง** (prod ใช้, dev ไม่แตะ), `english_zero_to_hero_dev` = dev, `english_zero_to_hero_dev_test` = integration test
- **Connection:** dev ใน Docker ใช้ `DATABASE_URL=postgres://ezh:ezh@postgres:5432/english_zero_to_hero_dev` (ตั้งใน `docker-compose.yml` service `app`); prod ใช้ `.../english_zero_to_hero`
- **Migrations:** แก้ `src/db/schema.ts` แล้วรัน `make db-generate` เพื่อสร้าง SQL จากนั้นรัน `make db-migrate` ห้ามแก้ตารางด้วยมือ ไฟล์ SQL อยู่ที่ `src/db/migrations/` (commit เข้า git) ตัวรัน migration คือ `src/db/migrate.ts` (`runMigrations(url)`) ใช้ซ้ำได้ทั้ง `make db-migrate`, เทสต์ และ production; รันซ้ำได้ปลอดภัย โฟลเดอร์ migration อ่านจาก `MIGRATIONS_DIR` (ค่าเริ่มต้น `src/db/migrations`) เส้นทาง migrate ของ prod (ไม่ใช้ tsx) ทำใน PR deploy
- **Client:** `src/db/client.ts` มี `getDb()` ตัวเดียวต่อ process (เก็บไว้บน `globalThis` กัน connection รั่วตอน hot reload) อ่าน `DATABASE_URL` และ throw ถ้าไม่ได้ตั้งค่า ใช้ได้ฝั่ง server เท่านั้น
- **Integration test:** ใช้ฐานข้อมูล `english_zero_to_hero_dev_test` (ชื่อ dev + `_test`) ที่ global setup สร้างและ migrate ให้เอง ล้างข้อมูลก่อนทุกเทสต์ (`TRUNCATE` ทุกตารางใน schema `public`) และหลังจบ ไม่แตะฐานข้อมูล dev; Vitest แบ่งเป็น project `unit` (jsdom ไม่ใช้ DB) กับ `integration` (`*.int.test.ts`, node)
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
-- (ตอนนี้ยังไม่ได้ติดตั้ง Better Auth จนถึง Milestone 2: มีเฉพาะตาราง user ที่ `src/db/auth-schema.ts`
--  โครงสร้างตรงกับ core schema ของ Better Auth เพื่อให้ FK ใช้งานได้ตั้งแต่ตอนนี้
--  user: id text PK, name text, email text UNIQUE, email_verified bool default false, image text,
--  created_at/updated_at timestamptz default now(); session/account/verification เพิ่มพร้อม Better Auth)

profiles       user_id PK→user, display_name, start_date date, current_day int, timezone text, accent text(us|uk), updated_at
progress       user_id, day int, status text(not_started|in_progress|done), score double, started_at timestamptz, completed_at timestamptz, updated_at
               PK(user_id, day), CHECK(status='done' ⇒ completed_at NOT NULL)
attempts       id uuid PK (สร้างฝั่ง client เพื่อกันบันทึกซ้ำตอน sync), user_id, exercise_id text, day int, skill text, exercise_type text,
               correct bool, score double, duration_ms int, tags text[], source text(lesson|drill|retest|checkpoint), session_id uuid, answer jsonb, created_at timestamptz
               skill = pronunciation|listening|speaking|reading|writing|vocabulary
               INDEX(user_id, created_at), INDEX(user_id, exercise_id), INDEX(user_id, skill, created_at), INDEX(user_id, source, created_at), GIN(tags)
srs_cards      user_id, vocab_id text, direction text(en_th|th_en|listen_spell|speak),
               due timestamptz, stability double, difficulty double, scheduled_days int, learning_steps smallint, elapsed_days int,
               reps int, lapses int, state smallint, last_review timestamptz, updated_at
               PK(user_id, vocab_id, direction), INDEX(user_id, due)
srs_reviews    id uuid PK (สร้างฝั่ง client), user_id, vocab_id text, direction text, rating smallint(1..4), reviewed_at timestamptz,
               duration_ms int, state_before jsonb, state_after jsonb, created_at timestamptz
               INDEX(user_id, reviewed_at), INDEX(user_id, vocab_id, direction, reviewed_at)
recordings     id uuid PK, user_id, exercise_id text, day int, tags text[], object_key text, pron_score jsonb, created_at timestamptz
streaks        user_id PK, current int, longest int, last_active_date date, freezes_left int, updated_at
push_subscriptions  id uuid PK, user_id, endpoint text UNIQUE, p256dh text, auth text, created_at timestamptz
reminder_settings   user_id PK, enabled bool, remind_at time, types text[], updated_at
```

- `user_id` ทุกตารางที่ไม่ใช่ `user` เป็น FK ไปที่ `user.id` แบบ `ON DELETE CASCADE`
- `jsonb` ใช้เก็บข้อมูลที่โครงสร้างต่างกันตาม exercise type (คำตอบ, คะแนนการออกเสียงรายเสียง)
- `object_key` คือ path ของไฟล์ใน `data/recordings/` ไม่ได้เก็บไฟล์เสียงใน Postgres

**ค่า default และ constraint ที่ spec ไม่ได้ระบุ (เลือกไว้ใน PR `feat/m0-db-schema`)**

- **ชุดค่าที่กำหนดไว้ตายตัว** (`accent`, `progress.status`, `direction`, `attempts.skill`, `attempts.source`) เป็น `text` + CHECK ไม่ใช้ pg enum (เพิ่มค่าทีหลังแค่แก้ constraint) ฝั่ง TypeScript ใช้ `$type<...>()` ให้แคบ ค่าที่ไม่รู้จักจึงถูกปฏิเสธด้วย error 23514
- `score`, `stability`, `difficulty` เป็น `double precision` (ไม่ใช้ `real` เพื่อกันค่าคลาดเคลื่อน)
- ทุกตารางที่มี `created_at`: `timestamptz NOT NULL DEFAULT now()`; `updated_at` (`NOT NULL DEFAULT now()`) อยู่ที่ `profiles`, `progress`, `srs_cards`, `streaks`, `reminder_settings` แอปเป็นคนอัปเดตค่าตอนเขียน ไม่มี trigger
- ทุก `user_id` เป็น `text NOT NULL` FK `ON DELETE CASCADE`
- `user`: unique ทั้ง `email` และ unique index บน `lower(email)` (อีเมลซ้ำแบบตัวพิมพ์เล็กใหญ่ไม่ได้)
- `profiles`: `display_name` nullable, `start_date` NOT NULL ไม่มี default (ผู้เรียนเลือกตอน onboarding), `current_day` default 1 + CHECK 1..365, `timezone` NOT NULL default `Asia/Bangkok`, `accent` NOT NULL default `us`
- `progress`: `status` default `not_started`; `score`, `started_at`, `completed_at` nullable; CHECK `day` 1..365; CHECK `status = 'done'` ต้องมี `completed_at` (ไม่ได้ CHECK ช่วงของ `score` เพราะยังไม่ได้กำหนดสเกล)
- `attempts`: `id` default `gen_random_uuid()` (client ส่ง id มาเองได้); NOT NULL: `day` (CHECK 1..365), `skill`, `exercise_type`, `correct`; `tags` default `{}` (รายการสิ่งที่ข้อนี้ฝึก เช่น `phoneme:ae`, `vocab:v-cat` ดู [PROGRESS.md](PROGRESS.md)); `source` default `lesson`; `duration_ms` nullable + CHECK >= 0; `session_id`, `score`, `answer` nullable
- `srs_cards`: `due` default `now()` (การ์ดใหม่ถึงกำหนดทันที), `stability`/`difficulty` NOT NULL default 0, `scheduled_days`/`learning_steps`/`elapsed_days`/`reps`/`lapses` default 0 + CHECK >= 0 (ฟิลด์ของ ts-fsrs), `state` default 0 + CHECK 0..3 (New/Learning/Review/Relearning), `last_review` nullable
- `srs_reviews`: 1 แถวต่อการทบทวน 1 ครั้ง `id` default `gen_random_uuid()` (client ส่งมาเองได้), `rating` CHECK 1..4, `reviewed_at` NOT NULL ไม่มี default, `state_after` NOT NULL, `state_before` และ `duration_ms` nullable (+ CHECK >= 0)
- `recordings`: `id` default `gen_random_uuid()`; `object_key` NOT NULL; `pron_score` nullable (ยังไม่ได้ให้คะแนน); `day` nullable + CHECK 1..365; `tags` default `{}`
- `streaks`: `current`/`longest`/`freezes_left` NOT NULL default 0 + CHECK >= 0; `last_active_date` nullable
- `push_subscriptions`: `id` default `gen_random_uuid()`; `p256dh`, `auth` NOT NULL
- `reminder_settings`: `enabled` default false, `remind_at` NOT NULL default `20:00`, `types` NOT NULL default `{}`

`exercise_id` และ `vocab_id` เป็น ID แบบ string ที่กำหนดไว้ในไฟล์ content (เช่น `d001-pron-01`) จึงผูกกับ git ได้โดยตรง

## 5. Flow ของ Lesson Player

1. `loader.ts` อ่าน `content/lessons/day-XXX.json` แล้วตรวจกับ schema
2. หน้า `/day/[day]` render ทีละ section ทีละ exercise
3. แต่ละ exercise ส่งผลลัพธ์ไปที่ `attempts`
4. เมื่อจบบท จะอัปเดต `progress` และ `streaks` แล้วเพิ่มคำศัพท์ของบทเข้า `srs_cards`
