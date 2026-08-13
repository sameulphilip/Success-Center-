# Center ERP Mobile

Flutter app for **Teacher**, **Reception ops desk**, and **Parent/Student** portal.

## Run

```bash
flutter pub get

# Production (success.cowdlly.com)
flutter run --dart-define=API_URL=https://success.cowdlly.com/api

# Android emulator → local API
flutter run --dart-define=API_URL=http://10.0.2.2:3001/api

# Windows / desktop → local API
flutter run -d windows --dart-define=API_URL=http://localhost:3001/api
```

## Features

- **Parent/Student:** children switcher, QR, attendance, grades, invoices, door session payments, absence alert banner
- **Reception / Manager:** ops desk (open session pay + check-in by phone)
- **Teacher:** groups attendance + QR mark

## Demo accounts

- Admin: `admin@center.local` / `Admin@123`
- Teacher: `teacher@center.local` / `Teacher@123`
- Parent: `parent@center.local` / `Parent@123`
