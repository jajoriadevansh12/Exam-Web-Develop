-- ============================================================================
-- HUMAN-READABLE DATABASE VIEWS FOR CAMPUS EXAM SUITE
-- Converts cryptic UUID foreign keys into clean human names for Supabase Studio
-- ============================================================================

-- 1. VIEW: Students Directory (Replaces course_id, batch_id, section_id UUIDs)
CREATE OR REPLACE VIEW public.view_students_directory AS
SELECT
  s.registration_number,
  s.roll_number,
  s.name AS student_name,
  s.email,
  c.name AS course_name,
  c.code AS course_code,
  b.name AS batch_name,
  b.start_year || ' - ' || b.end_year AS batch_duration,
  COALESCE(sec.name, 'Unassigned') AS section_name,
  s.status,
  s.created_at
FROM public.students s
LEFT JOIN public.courses c ON s.course_id = c.id
LEFT JOIN public.batches b ON s.batch_id = b.id
LEFT JOIN public.sections sec ON s.section_id = sec.id
ORDER BY c.code, b.name, s.roll_number, s.registration_number;

-- 2. VIEW: Seating Plan Master (Replaces plan_id, room_id, student_id UUIDs)
CREATE OR REPLACE VIEW public.view_seating_plan_master AS
SELECT
  e.name AS exam_paper,
  e.exam_date,
  e.session,
  r.block AS hall_block,
  r.room_number AS hall_number,
  'Row ' || sa.row_number || ' - Seat ' || sa.seat_number AS desk_coordinate,
  sa.row_number,
  sa.seat_number,
  s.name AS student_name,
  s.registration_number,
  s.roll_number,
  c.code AS course_code,
  b.name AS batch_name,
  sa.group_label,
  sp.strategy
FROM public.seat_allocations sa
JOIN public.seating_plans sp ON sa.plan_id = sp.id
JOIN public.exams e ON sp.exam_id = e.id
JOIN public.rooms r ON sa.room_id = r.id
JOIN public.students s ON sa.student_id = s.id
LEFT JOIN public.courses c ON s.course_id = c.id
LEFT JOIN public.batches b ON s.batch_id = b.id
ORDER BY e.exam_date DESC, e.session, r.block, r.room_number, sa.row_number, sa.seat_number;

-- 3. VIEW: Faculty Invigilation Duties (Replaces professor_id, exam_id, room_id UUIDs)
CREATE OR REPLACE VIEW public.view_faculty_duties AS
SELECT
  p.name AS faculty_name,
  p.employee_id,
  p.department,
  p.email,
  p.phone,
  e.name AS exam_paper,
  e.exam_date,
  e.session,
  r.block AS hall_block,
  r.room_number AS hall_number,
  CASE WHEN pd.notified THEN 'Email Sent' ELSE 'Pending Notification' END AS notification_status,
  pd.created_at AS assigned_at
FROM public.professor_duties pd
JOIN public.professors p ON pd.professor_id = p.id
JOIN public.exams e ON pd.exam_id = e.id
JOIN public.rooms r ON pd.room_id = r.id
ORDER BY e.exam_date DESC, e.session, r.block, r.room_number, p.name;

-- 4. VIEW: Exam Schedules & Appearing Batches (Replaces exam_id, course_id, batch_id UUIDs)
CREATE OR REPLACE VIEW public.view_exam_schedule AS
SELECT
  e.name AS exam_name,
  e.exam_date,
  e.session,
  c.code AS course_code,
  c.name AS course_name,
  b.name AS batch_name,
  b.start_year || ' - ' || b.end_year AS batch_duration,
  e.created_at
FROM public.exams e
LEFT JOIN public.exam_groups eg ON e.id = eg.exam_id
LEFT JOIN public.courses c ON eg.course_id = c.id
LEFT JOIN public.batches b ON eg.batch_id = b.id
ORDER BY e.exam_date DESC, e.session, c.code;

-- Grant permissions for Supabase Studio and authenticated staff
GRANT SELECT ON public.view_students_directory TO authenticated, anon, service_role;
GRANT SELECT ON public.view_seating_plan_master TO authenticated, anon, service_role;
GRANT SELECT ON public.view_faculty_duties TO authenticated, anon, service_role;
GRANT SELECT ON public.view_exam_schedule TO authenticated, anon, service_role;
