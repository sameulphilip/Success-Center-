# Center ERP — نظام إدارة سنتر تعليمي

Cloud-based Center Management System:

- **Web Admin** (`apps/web`) — Next.js RTL
- **API** (`apps/api`) — NestJS + Prisma + PostgreSQL
- **Mobile** (`apps/mobile`) — Flutter (Teacher + Parent/Student)
- **Shared** (`packages/shared`) — Zod schemas & enums

## Quick start

```bash
# 1) Infrastructure
docker compose up -d

# 2) Install
pnpm install

# 3) Database
pnpm --filter @center-erp/api prisma:generate
pnpm --filter @center-erp/api exec prisma migrate dev --name init
pnpm db:seed

# 4) Run API + Web
pnpm --filter @center-erp/api dev
pnpm --filter @center-erp/web dev
```

- Admin Web: http://localhost:3000  
- API: http://localhost:3001/api  
- Login: `admin@center.local` / `Admin@123`

## Roles

Super Admin · Center Manager · Accountant · Reception · Teacher · Parent · Student

## Modules

Students, Teachers, Groups & Calendar, Attendance (manual + QR), Finance, Exams, Messaging (In-App/SMS/WhatsApp providers), Dashboard.
