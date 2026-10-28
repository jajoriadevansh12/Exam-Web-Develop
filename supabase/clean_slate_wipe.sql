-- =============================================================================
-- CAMPUS EXAM SUITE — 100% SAFE DYNAMIC DATABASE WIPE
-- Run this in your Supabase Dashboard -> SQL Editor
-- This clears all data from whatever tables exist, skipping missing ones safely,
-- and preserves all schema, RLS policies, views, triggers, and user logins!
-- =============================================================================

DO $$
DECLARE
  table_list text[] := ARRAY[
    'exam_attendance',
    'seat_allocations',
    'seating_plans',
    'professor_duties',
    'professor_leaves',
    'student_subjects',
    'exam_groups',
    'exams',
    'students',
    'sections',
    'batches',
    'subjects',
    'courses',
    'rooms',
    'professors',
    'activity_logs',
    'import_logs'
  ];
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY table_list LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I CASCADE', tbl);
      RAISE NOTICE 'Cleared table: public.%', tbl;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Database completely emptied! Ready for clean deployment.';
END $$;
