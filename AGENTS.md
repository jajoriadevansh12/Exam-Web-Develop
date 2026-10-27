# Campus Exam Suite — Codebase Guide

## Architecture

- **Frontend**: React 19 + TanStack Router (file-based routing) + TanStack Query (server state)
- **Backend**: Supabase — PostgreSQL + Auth + RLS + Edge Functions
- **Language**: JavaScript (JSX) for new files, TypeScript for legacy UI components
- **Email**: Supabase Edge Function `send-email` using SMTP (denomailer)

## Directory Structure

```
src/
├── components/
│   ├── layout/AdminLayout.tsx   # Sidebar + header
│   ├── shared/                  # DataPagination, SuggestInput
│   └── ui/                      # shadcn/ui components
├── lib/
│   ├── db.ts                    # Courses, batches, sections, students, logs
│   ├── seating.ts               # Rooms, exams, exam groups, seating plan (DB ops)
│   ├── seating-algorithm.js     # Pure seating logic (column-wise, alternate, balanced alloc)
│   ├── seating-export.ts        # Excel workbook export
│   ├── professors.js            # Professors CRUD, import, duty assignment, leave management
│   ├── email.js                 # Email dispatch via Edge Function
│   └── auth.tsx                 # Auth context
├── routes/_authenticated/
│   ├── dashboard.tsx            # Home stats
│   ├── courses.tsx              # Course CRUD
│   ├── batches.tsx              # Batch CRUD
│   ├── sections.tsx             # Section CRUD
│   ├── rooms.tsx                # Room CRUD
│   ├── students/                # Student list, import, cards
│   ├── exams/                   # Exam list + seating page
│   ├── professors/              # Professor list, import, leaves
│   └── logs.tsx                 # Activity + import logs
└── integrations/supabase/       # Supabase client, types
```

## Key Business Rules

1. **Registration Number** is the permanent student identity (not roll number)
2. **Employee ID** is the permanent professor identity
3. Students store Subject IDs, not Subject Names
4. Seating: column-wise fills all columns before rows; balanced allocation distributes evenly
5. Auto-assignment skips professors on leave and respects max_duties
6. Email notifications sent via `send-email` Edge Function (SMTP)
7. Leave import flags any existing duty conflicts for manual resolution

## Adding New Features

- New page → add JSX file under `src/routes/_authenticated/`
- New DB table → add SQL migration in `supabase/migrations/`
- New email template → add function in `src/lib/email.js`
