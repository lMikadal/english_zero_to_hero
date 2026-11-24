# CLAUDE.md

แอปฝึกภาษาอังกฤษ 365 วันสำหรับคนไทย ก่อนเริ่มงานให้อ่าน `docs/` ก่อน:
- `docs/PLAN.md`: เป้าหมาย, ฟีเจอร์, roadmap (milestone ปัจจุบันดูได้จาก checkbox)
- `docs/CURRICULUM.md`: หลักสูตร
- `docs/VOCABULARY.md`: แผนคำศัพท์ Oxford 3000/5000
- `docs/ARCHITECTURE.md`: stack และโครงสร้างโฟลเดอร์
- `docs/CONTENT_SCHEMA.md`: รูปแบบไฟล์บทเรียน
- `docs/AI_TEAM.md`: บทบาทของทีม AI (นิยามอยู่ที่ `.claude/agents/`)
- `docs/GIT_WORKFLOW.md`: branch, commit, แผน PR
- `docs/TESTING.md`: TDD
- `docs/DEPLOYMENT.md`: host บนเครื่องผู้ใช้เอง (ผู้ใช้คนเดียว) ผ่าน Docker + Tailscale

## กฎ
- เนื้อหาบทเรียนทั้งหมดอยู่ใน `content/` เป็น JSON ห้ามเก็บเนื้อหาไว้ใน DB หรือ hardcode ใน component
- เมื่อแก้ schema ต้องอัปเดต `docs/CONTENT_SCHEMA.md` และ `src/lib/content/schema.ts` พร้อมกัน
- Exercise ID ต้องไม่ซ้ำกันทั้ง repo (รูปแบบ `dXXX-<skill>-NN`)
- คำศัพท์เก็บไว้ที่ `content/vocab/` ที่เดียว บทเรียนอ้างถึงด้วย ID เท่านั้น และแต่ละคำสอนเป็นคำใหม่ได้ครั้งเดียว
- คำแปลไทย ตัวอย่างประโยค และ collocation ต้องเขียนเอง ห้ามคัดลอกคำนิยามหรือตัวอย่างจากพจนานุกรม Oxford
- ข้อความที่แสดงผู้เรียนต้องมีภาษาไทยกำกับ (`{ en, th }`)
- API key ใช้เฉพาะฝั่ง server เท่านั้น ห้าม commit `.env*` (ยกเว้น `.env.example`)
- Database คือ PostgreSQL ผ่าน Drizzle ORM: แก้โครงสร้างตารางที่ `src/db/schema.ts` แล้วรัน `make db-generate` และ commit ไฟล์ migration ด้วย ห้ามแก้ตารางด้วยมือ
- **ทุกอย่างของแอปรันใน Docker:** ห้ามรัน `pnpm`, `node`, `psql` บน host ให้ใช้ `make <target>` หรือ `docker compose run --rm app ...`
- **TDD:** เขียนเทสต์ที่ไม่ผ่านก่อน แล้วค่อยเขียนโค้ด และ commit เทสต์ก่อนโค้ด
- **Git:** ห้าม commit ลง `main` โดยตรง ทำงานใน branch แล้วเปิด PR ด้วย `gh` สรุปให้ผู้ใช้ และ merge (squash) ได้เมื่อผู้ใช้ตอบตกลงใน PR นั้นเท่านั้น
- **ถ้าไม่แน่ใจให้ถามผู้ใช้ก่อนเสมอ ห้ามเดา** และทำงานทีละขั้น รายงานผลก่อนไปขั้นถัดไป
- คำสั่งที่ต้องใช้ sudo ให้เขียนให้ผู้ใช้รันเอง
- เป็น PWA แบบ mobile-first: ทุกหน้าต้องใช้งานได้ที่ความกว้าง 360px, ฟีเจอร์หลักต้องทำงานออฟไลน์ได้ (ดู `docs/ARCHITECTURE.md` หัวข้อ 3.2) และข้อมูลที่เขียนจาก client ต้องผ่านคิว offline ที่มี id กันบันทึกซ้ำ
- เมื่อทำ roadmap item เสร็จ ให้ติ๊ก checkbox ใน `docs/PLAN.md`
