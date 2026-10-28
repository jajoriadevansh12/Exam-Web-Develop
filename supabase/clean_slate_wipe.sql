-- =============================================================================
-- CAMPUS EXAM SUITE — 1-CLICK CLEAN SLATE DATABASE WIPE
-- Run this in your Supabase Dashboard -> SQL Editor
-- This removes all imported data (students, exams, rooms, courses, batches, etc.)
-- but preserves your tables, RLS policies, views, triggers, and admin login accounts!
-- =============================================================================

DO $$
BEGIN
  -- 1. Wipe Attendance & Seating Plans
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'exam_attendance') THEN
    TRUNCATE TABLE public.exam_attendance CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'seat_allocations') THEN
    TRUNCATE TABLE public.seat_allocations CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'seating_plans') THEN
    TRUNCATE TABLE public.seating_plans CASCADE;
  END IF;

  -- 2. Wipe Faculty Duties & Leaves
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'professor_duties') THEN
    TRUNCATE TABLE public.professor_duties CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'professor_leaves') THEN
    TRUNCATE TABLE public.professor_leaves CASCADE;
  END IF;

  -- 3. Wipe Exams & Groups
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'exam_groups') THEN
    TRUNCATE TABLE public.exam_groups CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'exams') THEN
    TRUNCATE TABLE public.exams CASCADE;
  END IF;

  -- 4. Wipe Student Subjects & Students
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'student_subjects') THEN
    TRUNCATE TABLE public.student_subjects CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'students') THEN
    TRUNCATE TABLE public.students CASCADE;
  END IF;

  -- 5. Wipe Hierarchy (Sections, Batches, Subjects, Courses)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sections') THEN
    TRUNCATE TABLE public.sections CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'batches') THEN
    TRUNCATE TABLE public.batches CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subjects') THEN
    TRUNCATE TABLE public.subjects CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'courses') THEN
    TRUNCATE TABLE public.courses CASCADE;
  END IF;

  -- 6. Wipe Rooms & Faculty
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rooms') THEN
    TRUNCATE TABLE public.rooms CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'professors') THEN
    TRUNCATE TABLE public.professors CASCADE;
  END IF;

  -- 7. Wipe Activity & Import Logs
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activity_logs') THEN
    TRUNCATE TABLE public.activity_logs CASCADE;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'import_logs') THEN
    TRUNCATE TABLE public.import_logs CASCADE;
  END IF;

  RAISE NOTICE '✅ Database completely emptied! Ready for clean deployment and fresh imports.';
END $$;
