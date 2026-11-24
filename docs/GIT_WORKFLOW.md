# Git Workflow

## 1. Branch

ใช้แบบ **trunk-based**: มี `main` เป็นแกนเดียว และแตก branch อายุสั้นสำหรับแต่ละงาน

| Branch | ใช้ทำอะไร | ตัวอย่าง |
|---|---|---|
| `main` | โค้ดที่ใช้งานได้เสมอ เครื่องที่ host แอป deploy จาก branch นี้ แก้ได้ผ่าน PR เท่านั้น | |
| `feat/<milestone>-<งาน>` | ฟีเจอร์ใหม่ | `feat/m1-lesson-player` |
| `content/<ช่วงวัน>` | เนื้อหาบทเรียนและคำศัพท์ | `content/day-002-007` |
| `fix/<เรื่อง>` | แก้บั๊ก | `fix/srs-due-timezone` |
| `chore/<เรื่อง>` | Docker, CI, เครื่องมือ | `chore/m0-docker-scaffold` |
| `docs/<เรื่อง>` | เอกสารอย่างเดียว | `docs/phase2-weekly-plan` |

- 1 branch = 1 PR = 1 เรื่อง และควรเล็กพอที่ตรวจจบได้ในครั้งเดียว (เนื้อหาบทเรียนแบ่ง PR ละ 1 สัปดาห์)
- แตก branch จาก `main` ล่าสุดเสมอ และลบ branch ทิ้งหลัง merge

## 2. Commit

ใช้รูปแบบ Conventional Commits: `<type>(<scope>): <สรุป>`

```
feat(player): add minimal_pair exercise
content(day-003): add /θ/ lesson
fix(srs): use user timezone for due date
chore(docker): add dev Dockerfile
```

type ที่ใช้: `feat`, `fix`, `content`, `docs`, `chore`, `test`, `refactor`

เพราะทำแบบ TDD ใน branch จึงต้อง **commit เทสต์ก่อนโค้ด** เช่น

```
test(srs): due date uses user timezone      ← เทสต์ยังไม่ผ่าน (red)
fix(srs): use user timezone for due date    ← เทสต์ผ่าน (green)
```

## 3. Pull Request

1. งานผ่าน `make check` ใน Docker (lint, typecheck, test, content:validate)
2. `qa-tester` และ reviewer (`code-reviewer` หรือ `content-reviewer`) ตรวจผ่านแล้ว
3. orchestrator push branch และเปิด PR ตาม `.github/pull_request_template.md`
4. CI บน GitHub ต้องผ่าน
5. orchestrator สรุป PR ให้ผู้ใช้ในแชต **เมื่อผู้ใช้ตอบตกลง orchestrator จึง merge** แบบ **squash** ด้วย `gh pr merge --squash --delete-branch` (1 PR = 1 commit บน `main`) ห้าม merge ก่อนผู้ใช้ตอบตกลง
6. ติ๊ก checkbox ของงานนั้นใน `docs/PLAN.md` ภายใน PR เดียวกัน

## 4. แผน PR

### Milestone 0: วางรากฐาน

| # | Branch | เนื้อหา | ผู้ทำ |
|---|---|---|---|
| 0 | `main` (commit แรก) | เอกสารแผนทั้งหมด, นิยามทีม AI, ตัวอย่างเนื้อหา | orchestrator |
| 1 | `chore/m0-docker-scaffold` | Dockerfile, compose (app + postgres), Makefile, โครง Next.js + TypeScript + Tailwind, ตั้งค่า Vitest + Playwright พร้อมเทสต์แรก | devops, frontend-dev |
| 2 | `feat/m0-content-schema` | Zod schema ของบทเรียนและคำศัพท์, `content:validate`, เทสต์ | backend-dev |
| 3 | `feat/m0-db-schema` | Drizzle schema, migration แรก, คำสั่ง `db:*` | backend-dev |
| 4 | `feat/m0-vocab-import` | สคริปต์ `vocab:import` สำหรับรายการ Oxford 3000/5000 | backend-dev, data-clerk |
| 5 | `chore/m0-ci` | GitHub Actions: lint, typecheck, test, validate, migrate | devops |

PR 2, 3 ทำพร้อมกันได้หลัง PR 1 merge แล้ว

### Milestone 1: MVP

| # | Branch | เนื้อหา | ผู้ทำ |
|---|---|---|---|
| 6 | `feat/m1-lesson-player` | Lesson Player + exercise ชุดแรก (ฟัง, อ่าน, เขียน) | frontend-dev |
| 7 | `feat/m1-audio-tts` | สคริปต์ `audio:generate` + ตัวเล่นเสียงปรับความเร็วได้ | backend-dev, frontend-dev |
| 8 | `feat/m1-recording` | อัดเสียง ฟังเทียบ และเก็บไฟล์ | frontend-dev, backend-dev |
| 9 | `feat/m1-progress-streak` | บันทึกความคืบหน้า, attempts, streak | backend-dev, frontend-dev |
| 10 | `feat/m1-srs` | ทบทวนคำศัพท์ด้วย FSRS | backend-dev, frontend-dev |
| 11 | `feat/m1-word-bank` | หน้า Word Bank และรายละเอียดคำ | frontend-dev |
| 12 | `feat/m1-pwa-basic` | manifest, ไอคอน, service worker, ปุ่มติดตั้ง | frontend-dev |
| 13 | `chore/m1-selfhost-deploy` | compose profile `prod`, Tailscale, backup | devops |
| C1–C5 | `content/day-...` | เนื้อหาวันที่ 2–30 (สัปดาห์ละ 1 PR) + คำศัพท์ A1 | content-writer, content-reviewer |

PR เนื้อหา (C1–C5) ทำคู่ขนานกับ PR โค้ดได้ตลอด เพราะแก้คนละโฟลเดอร์

Milestone 2 เป็นต้นไปจะวางแผน PR เมื่อ Milestone 1 ใกล้เสร็จ
