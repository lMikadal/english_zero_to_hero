# English Zero to Hero

เว็บแอปฝึกภาษาอังกฤษ 365 วัน สำหรับคนไทยที่เริ่มจากศูนย์ ไล่ตั้งแต่การออกเสียง ฟัง พูด อ่าน จนถึงเขียน
เป็น **PWA** ที่ติดตั้งลงมือถือได้และเรียนออฟไลน์ได้ ใช้ **PostgreSQL** เป็นฐานข้อมูล
เป้าหมายคือไปจากระดับ **Pre-A1 ถึง B1/B2** (CEFR) โดยฝึกวันละ 30–45 นาที

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | วิสัยทัศน์, ฟีเจอร์, roadmap |
| [docs/CURRICULUM.md](docs/CURRICULUM.md) | หลักสูตร 365 วัน, โครงสร้างสัปดาห์และบทเรียนรายวัน |
| [docs/VOCABULARY.md](docs/VOCABULARY.md) | แผนคำศัพท์ Oxford 3000/5000 สำหรับชีวิตประจำวัน |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tech stack, โครงสร้างโฟลเดอร์, data model |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | วิธี host บนเครื่องตัวเองด้วย Docker + Tailscale |
| [docs/AI_TEAM.md](docs/AI_TEAM.md) | ทีม AI: บทบาท, โมเดล, ขั้นตอนทำงาน |
| [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) | การแบ่ง branch, commit และแผน PR |
| [docs/TESTING.md](docs/TESTING.md) | แนวทาง TDD และเทสต์แต่ละชั้น |
| [docs/CONTENT_SCHEMA.md](docs/CONTENT_SCHEMA.md) | รูปแบบไฟล์บทเรียน (JSON) |
| [content/lessons/](content/lessons/) | เนื้อหาบทเรียนรายวัน `day-001.json` ถึง `day-365.json` |
| [content/vocab/](content/vocab/) | คลังคำศัพท์ Oxford 3000/5000 แยกตามระดับ |

## หลักการ

**ทุกอย่างอยู่ใน repo นี้:** หลักสูตร เนื้อหาบทเรียน แบบฝึกหัด และค่า config เก็บเป็นไฟล์ที่อ่านได้และจัดการเวอร์ชันด้วย git
ฐานข้อมูลเก็บเฉพาะข้อมูลของผู้ใช้ (ความคืบหน้า, คะแนน, เสียงที่อัด) ไม่เก็บเนื้อหาบทเรียน
