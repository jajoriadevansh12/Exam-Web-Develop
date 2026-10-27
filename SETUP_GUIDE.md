# Campus Exam Suite — Setup & Configuration Guide

## 1. Prerequisites

- Node.js 18+ or Bun
- A [Supabase](https://supabase.com) project

## 2. Install dependencies

```bash
npm install
# or
bun install
```

## 3. Environment variables

Copy `.env` and fill in your values:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `VITE_UNIVERSITY_NAME` | Shown in PDFs and email footers |
| `VITE_SMTP_*` | SMTP credentials (for local dev only; production uses Edge Function secrets) |

## 4. Database setup

Run all migrations in order:

```bash
supabase db push
# or run each SQL file manually in the Supabase SQL editor
```

Migrations add:
- Core tables: courses, batches, sections, students, subjects, rooms, exams, seating_plans, seat_allocations
- New tables: **professors**, **professor_duties**, **professor_leaves**, **smtp_config**
- RLS policies on all tables
- Auto-profile trigger for new users

## 5. Email (SMTP) setup

### Option A — Supabase Edge Function (recommended for production)

1. Deploy the edge function:
   ```bash
   supabase functions deploy send-email
   ```

2. Set secrets (example with Gmail):
   ```bash
   supabase secrets set SMTP_HOST=smtp.gmail.com
   supabase secrets set SMTP_PORT=587
   supabase secrets set SMTP_USER=examoffice@youruni.edu
   supabase secrets set SMTP_PASS=your_16_char_app_password
   supabase secrets set SMTP_FROM="Exam Office <examoffice@youruni.edu>"
   ```

   For Gmail: enable 2FA → generate App Password at https://myaccount.google.com/apppasswords

### Option B — Direct SMTP from browser (dev/testing only)

Set `VITE_EMAIL_RELAY_URL` to a local SMTP relay service (e.g., Mailhog, Mailtrap).

## 6. Running locally

```bash
npm run dev
```

Opens at http://localhost:3000

## 7. First login

The first user to sign up automatically becomes **Admin**. All subsequent users become **Staff**.

---

## Feature Reference

### Professor Module

- **Add manually**: Professors → Add Professor
- **Import from Excel**: Professors → Import Excel
  - Required columns: `Employee ID`, `Name`, `Department`, `Email`
  - Optional: `Phone`, `Max Duties`
- **Import leaves**: Professors → Leaves → Import Leaves
  - Required columns: `Employee ID`, `Leave Date` (YYYY-MM-DD)
  - The system auto-detects duty conflicts and shows a warning

### Seating Generation

1. Select exam groups (batches sitting the exam)
2. Select rooms
3. Choose strategy:
   - **Column-wise**: fills every column top-to-bottom before moving to next; last rows may be empty but all columns are fully populated
   - **Alternate**: interleaves groups across rows for anti-malpractice
4. Choose professors per room (1/2/3 — system suggests based on student count)
5. Click **Generate Preview**
6. Click **Save Plan**

### Professor Duty Assignment

- **Auto-Assign**: Respects leave dates and max_duties; prioritises professors with fewest duties
- **Manual**: Add duties one by one from the seating page
- **Send emails**: Click "Email All Professors" — each receives date, session, room details
- **Download duty sheet**: Export all duties to Excel for admin records

### Leave Conflict Detection

When a leave sheet is uploaded and a professor already has a duty on that date, the system:
1. Shows a warning table with all conflicts
2. Does NOT auto-remove the duty (admin must manually reassign)
3. That professor will be excluded from future auto-assignments on that date

### Seating Algorithm (column-wise)

- All columns are filled before moving on — so if a room has 6 columns and 5 rows, column 1 gets 5 students, column 2 gets 5, …, last rows may be empty
- Balanced allocation: 110 students across 4 rooms → 28/28/27/27, never 30/30/30/20
