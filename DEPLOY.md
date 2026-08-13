# Success Center — دليل النشر على سيرفر

## المطلوب
- سيرفر Ubuntu 22.04+ (DigitalOcean / Contabo / Hetzner / أي VPS)
- دومين (اختياري لكن مستحسن) يشير لـ IP السيرفر
- Docker + Docker Compose

---

## 1) تثبيت Docker على السيرفر

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# اعمل logout/login ثم:
docker --version
```

ارفع المشروع للسيرفر (git clone أو `scp` / FileZilla).

```bash
cd /opt
sudo git clone YOUR_REPO_URL center-erp
cd center-erp
# أو ارفع المجلد يدوياً إلى /opt/center-erp
```

---

## 2) إعداد ملف البيئة + لينك الـ DB

```bash
cp .env.production.example .env
nano .env   # أو vim
```

### غيّر على الأقل
| المتغير | مثال |
|---------|------|
| `JWT_SECRET` | نص عشوائي طويل |
| `POSTGRES_PASSWORD` | باسورد قوي |
| `DATABASE_URL` | شوف تحت |
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com/api` |
| `NEXT_PUBLIC_CHECKIN_API_URL` | `https://api.yourdomain.com/api/check-in` |
| `DEVICE_API_KEY` + `NEXT_PUBLIC_DEVICE_API_KEY` | نفس القيمة |

### لينكات قاعدة البيانات

**أ) داخل Docker (الـ API بيتكلم مع Postgres جوّه الشبكة):**
```env
DATABASE_URL=postgresql://center:YOUR_PASSWORD@postgres:5432/center_erp?schema=public
```

**ب) من جهازك / DBeaver / Prisma Studio (من برّه السيرفر):**
```text
postgresql://center:YOUR_PASSWORD@YOUR_SERVER_IP:5432/center_erp?schema=public
```
- البورت الافتراضي المنشور: `5432` (متغير `POSTGRES_PORT`)
- افتح البورت في Firewall بحذر، أو استخدم SSH tunnel أفضل أمنيًا:

```bash
ssh -L 5433:127.0.0.1:5432 root@YOUR_SERVER_IP
# ثم محلياً:
# postgresql://center:YOUR_PASSWORD@localhost:5433/center_erp?schema=public
```

**ج) DB خارجية (Neon / Supabase):**
```env
DATABASE_URL=postgresql://user:pass@ep-xxxx.aws.neon.tech/neondb?sslmode=require
```
(تقدر تسيّب خدمة `postgres` شغالة أو توقفها لاحقاً؛ المهم إن `DATABASE_URL` يوجّه للمزود)

---

## 3) تشغيل النظام

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

عند الإقلاع الـ API يعمل تلقائياً: `prisma migrate deploy` ثم يشغّل السيرفر.

### Seed (مرة واحدة — حسابات تجريبية)

```bash
docker compose -f docker-compose.prod.yml exec api pnpm prisma:seed
```

حساب الأدمن بعد الـ seed:
- `admin@center.local` / `Admin@123`

---

## 4) HTTPS بدومين (Caddy — الأسهل)

ثبّت Caddy ثم:

```caddy
app.yourdomain.com {
  reverse_proxy localhost:3000
}

api.yourdomain.com {
  reverse_proxy localhost:3001
}
```

في `.env`:
```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
NEXT_PUBLIC_CHECKIN_API_URL=https://api.yourdomain.com/api/check-in
```

ثم أعد بناء الـ web (لأن `NEXT_PUBLIC_*` تتبني وقت الـ build):

```bash
docker compose -f docker-compose.prod.yml up -d --build web
```

### Nginx بديل

```nginx
server {
  server_name app.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
server {
  server_name api.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

---

## 5) منافذ وخدمات

| خدمة | منفذ على السيرفر | ملاحظة |
|------|------------------|--------|
| Web | 3000 | الواجهة |
| API | 3001 | `/api` |
| Postgres | 5432 | لينك الـ DB |
| Redis | داخلي فقط | مش منشور |

بدون دومين تقدر تفتح مؤقتاً:
- Web: `http://YOUR_IP:3000`
- API: `http://YOUR_IP:3001/api`
- وفي `.env` خلّي `NEXT_PUBLIC_API_URL=http://YOUR_IP:3001/api` ثم `--build web`

---

## 6) نسخ احتياطي للـ DB

يدوي:
```bash
bash scripts/backup-db.sh
```

تلقائي يوميًا (cron على السيرفر — الساعة 2 صباحًا):
```bash
chmod +x /opt/center-erp/scripts/backup-db.sh
(crontab -l 2>/dev/null; echo "0 2 * * * cd /opt/center-erp && bash scripts/backup-db.sh >> /var/log/center-erp-backup.log 2>&1") | crontab -
```

الملفات تتخزن في `/opt/center-erp/backups/` وتُحذف بعد 14 يومًا.

استعادة:
```bash
gunzip -c backups/center_erp_YYYY-MM-DD_HHMM.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U center center_erp
```

---

## 7) أوامر مفيدة

```bash
# حالة
docker compose -f docker-compose.prod.yml ps

# لوج API
docker compose -f docker-compose.prod.yml logs -f api --tail=100

# تحديث بعد git pull
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Prisma Studio من السيرفر (يفتح على 5555)
docker compose -f docker-compose.prod.yml exec api pnpm prisma:studio
```

---

## أمان سريع
1. غيّر كل كلمات السر في `.env`
2. لا تفتح بورت 5432 للعامة إلا خلف Firewall / IP allowlist — فضّل SSH tunnel
3. استخدم HTTPS قبل ما تدخل بيانات حقيقية
4. غيّر باسورد `admin@center.local` بعد أول دخول

## WhatsApp / PDF
شوف الأقسام القديمة تحت لو محتاج Meta/Twilio أو تصدير PDF من `/reports`.
