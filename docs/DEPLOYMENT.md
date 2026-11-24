# Deployment: Host บนเครื่องตัวเอง

แอปนี้ใช้เองคนเดียว และรันบนเครื่องของเราเองตลอด ไม่ใช้ cloud hosting

## 1. ภาพรวม

```
มือถือ / คอม (PWA)
      │  HTTPS ผ่าน Tailscale (https://<เครื่อง>.<tailnet>.ts.net)
      ▼
เครื่องตัวเอง (Arch Linux)
  └── docker compose
        ├── app       Next.js (production build) :3000
        └── postgres  PostgreSQL 17             :5432 (เปิดเฉพาะใน Docker network)
  └── data/
        ├── recordings/   ไฟล์เสียงที่อัด
        └── backups/      pg_dump รายวัน
```

## 2. ทำไมต้องใช้ Tailscale

- **PWA และไมโครโฟนต้องใช้ HTTPS:** ถ้าเปิดผ่าน `http://192.168.x.x` จากมือถือ จะติดตั้งแอป อัดเสียง และใช้ service worker ไม่ได้
- **`tailscale serve` มีใบรับรอง HTTPS ให้อัตโนมัติ:** ได้โดเมน `*.ts.net` โดยไม่ต้องซื้อโดเมนหรือเปิด port ที่ router
- **ใช้นอกบ้านได้และปลอดภัย:** เข้าได้เฉพาะอุปกรณ์ใน tailnet ของเรา คนอื่นมองไม่เห็นแอป

ทางเลือกอื่นคือ Cloudflare Tunnel (ต้องมีโดเมนของตัวเอง และแอปจะออกสู่อินเทอร์เน็ตสาธารณะ)

## 3. ขั้นตอนติดตั้ง (ครั้งแรก)

```bash
# 1. ติดตั้ง Tailscale บนเครื่อง (รันเอง เพราะต้องใช้ sudo)
sudo pacman -S tailscale
sudo systemctl enable --now tailscaled
sudo tailscale up
# ติดตั้งแอป Tailscale บนมือถือ แล้ว login บัญชีเดียวกัน
# เปิดใช้ MagicDNS และ HTTPS Certificates ในหน้า admin ของ Tailscale

# 2. ตั้งค่า env
cp .env.example .env   # กรอก secret และ API key
#    DATABASE_URL ใช้ host `postgres` (ชื่อ service ใน Docker)
#    BETTER_AUTH_URL=https://<เครื่อง>.<tailnet>.ts.net

# 3. รันแอป
make prod          # build แล้วรัน app + postgres
make db-migrate

# 4. เปิด HTTPS ผ่าน Tailscale
sudo tailscale serve --bg 3000
```

จากนั้นเปิด `https://<เครื่อง>.<tailnet>.ts.net` บนมือถือแล้วกด "ติดตั้งแอป" หรือ "เพิ่มไปยังหน้าจอโฮม"

## 3.1 เปิดและปิดแอปในแต่ละวัน

Docker **ไม่ได้ตั้งให้เปิดเองตอนเปิดเครื่อง** ผู้ใช้เป็นคนเปิดเอง

```bash
# เปิด
docker-on                      # = sudo systemctl start docker
make prod                      # ครั้งแรกหลังเปิด Docker (ถ้า container ถูกลบไปแล้ว)

# ปิด
make down                      # หยุดและลบ container (ข้อมูลใน volume ยังอยู่)
docker-off                     # = sudo systemctl stop docker.service docker.socket
```

`docker-on` และ `docker-off` เป็นสคริปต์ลัดของผู้ใช้ที่ `~/.local/bin/` (อยู่นอก repo)

- ถ้าปิด Docker โดยไม่ได้สั่ง `make down` ก่อน เมื่อเปิด Docker ครั้งถัดไป แอปจะกลับมารันเองโดยไม่ต้องสั่ง `make prod` (เพราะ compose ตั้ง `restart: unless-stopped`)
- ช่วงที่ Docker ปิดอยู่ ยังฝึกบทที่ดาวน์โหลดไว้ในมือถือได้ ผลการฝึกจะ sync เมื่อเปิดแอปบนเครื่องอีกครั้ง

## 4. อัปเดตแอป

```bash
git pull
make prod
make db-migrate
```

## 5. Backup

- cron/systemd timer รัน `pg_dump` ทุกวัน เก็บไฟล์ไว้ที่ `data/backups/` ย้อนหลัง 30 วัน
- สำรอง `data/recordings/` ด้วย ถ้าต้องการเก็บเสียงที่อัดไว้
- เนื้อหาบทเรียนอยู่ใน git อยู่แล้ว ไม่ต้อง backup แยก

## 6. ข้อควรรู้

- **เครื่องปิดอยู่ก็ยังฝึกได้:** บทเรียน 7 วันถัดไปถูกดาวน์โหลดเก็บในมือถือ ผลการฝึกจะ sync ขึ้นเครื่องเมื่อเครื่องเปิด
- **ช่วงที่เครื่องปิดจะใช้ไม่ได้:** การแจ้งเตือน (push) และฟีเจอร์ AI จะใช้ไม่ได้จนกว่าเครื่องจะเปิด รวมถึงช่วงที่เครื่องเปิดแต่ยังไม่ได้เปิด Docker ถ้าอยากให้เตือนตรงเวลาทุกวันโดยไม่ขึ้นกับเครื่อง ให้ตั้งนาฬิกาปลุกบนมือถือแทน
- **Docker เปิดด้วยมือ:** ไม่ตั้งให้ Docker เปิดเองตอนบูต ผู้ใช้เป็นคนเปิดเองเมื่อจะใช้ (ดูหัวข้อ 3.1) ห้ามใช้ `systemctl enable docker`
- **ผู้ใช้คนเดียว:** ปิดหน้าสมัครสมาชิกหลังสร้างบัญชีแรก (`ALLOW_SIGNUP=false`)
