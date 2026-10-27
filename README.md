# Campus Exam Suite

A production-ready University Examination Management System built with React, Vite, Supabase, and plain JavaScript utilities.

## Tech Stack

- **Frontend**: React 19 + TanStack Router + TanStack Query
- **UI**: shadcn/ui + Tailwind CSS v4
- **Backend**: Supabase (Auth + PostgreSQL + RLS)
- **Email**: SMTP via Supabase Edge Functions (Nodemailer)
- **Excel**: SheetJS (XLSX)

## Features

- Course → Batch → Section → Student hierarchy
- Excel import with smart sync (detects name/roll/section changes)
- **Professor management** with Excel import & leave tracking
- **SMTP email notifications** — auto-email duty assignments to professors
- **Leave management** — professors upload leave sheets; conflicts auto-flag
- Exam scheduling with configurable professors-per-room (1 or 2 based on strength)
- Seating: column-wise or alternate strategy, all columns filled first
- PDF seating sheets (landscape A4, one page per room)
- Activity & import logs

## Development

```sh
git clone <repo-url>
cd campus-exam-suite
npm install
npm run dev
```

Set environment variables in `.env`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SMTP_HOST=...
VITE_SMTP_PORT=587
VITE_SMTP_USER=...
VITE_SMTP_PASS=...
VITE_SMTP_FROM=examoffice@university.edu
```
