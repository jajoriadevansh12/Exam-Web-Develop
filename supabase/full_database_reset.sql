-- =============================================================================
-- CAMPUS EXAM SUITE — MULTI-ROLE COMPLETE DATABASE RESET & SEED SCRIPT
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. DROP EXISTING SCHEMA (CLEAN SLATE)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_staff(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_professor(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_student(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.touch_updated_at() CASCADE;

DROP TABLE IF EXISTS public.smtp_config CASCADE;
DROP TABLE IF EXISTS public.professor_leaves CASCADE;
DROP TABLE IF EXISTS public.professor_duties CASCADE;
DROP TABLE IF EXISTS public.professors CASCADE;
DROP TABLE IF EXISTS public.student_subjects CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.seat_allocations CASCADE;
DROP TABLE IF EXISTS public.seating_plans CASCADE;
DROP TABLE IF EXISTS public.exam_groups CASCADE;
DROP TABLE IF EXISTS public.exams CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.import_logs CASCADE;
DROP TABLE IF EXISTS public.students CASCADE;
DROP TABLE IF EXISTS public.sections CASCADE;
DROP TABLE IF EXISTS public.batches CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP TYPE IF EXISTS public.app_role CASCADE;

-- -----------------------------------------------------------------------------
-- 2. CREATE ENUMS & HELPER FUNCTIONS
-- -----------------------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'professor', 'student');

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END; 
$$;

-- -----------------------------------------------------------------------------
-- 3. CREATE ALL TABLES (DEPENDENCY ORDER)
-- -----------------------------------------------------------------------------

-- A. Profiles & Roles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- B. Academic Hierarchy
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER courses_touch BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_year int NOT NULL,
  end_year int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, name)
);
CREATE TRIGGER batches_touch BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, name)
);
CREATE TRIGGER sections_touch BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  registration_number text NOT NULL UNIQUE,
  roll_number text,
  name text NOT NULL,
  email text,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX students_user_idx ON public.students(user_id);
CREATE INDEX students_email_idx ON public.students(email);
CREATE TRIGGER students_touch BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- C. Subjects
CREATE TABLE public.subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text,
  name text NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.batches(id) ON DELETE CASCADE,
  semester integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subjects_unique_name ON public.subjects (course_id, batch_id, lower(name));
CREATE TRIGGER subjects_touch BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.student_subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id)
);

-- D. Rooms & Exams
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block text NOT NULL DEFAULT 'Main',
  room_number text NOT NULL,
  row_count integer NOT NULL DEFAULT 5,
  seats_per_row integer NOT NULL DEFAULT 6,
  capacity integer GENERATED ALWAYS AS (row_count * seats_per_row) STORED,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block, room_number)
);
CREATE TRIGGER rooms_touch BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  exam_date date NOT NULL,
  session text NOT NULL DEFAULT 'morning',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER exams_touch BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.exam_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, course_id, batch_id)
);

CREATE TABLE public.seating_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  strategy text NOT NULL DEFAULT 'mixed_balanced',
  total_students integer NOT NULL DEFAULT 0,
  rooms_used integer NOT NULL DEFAULT 0,
  professors_per_room integer NOT NULL DEFAULT 1,
  generated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id)
);
CREATE TRIGGER seating_plans_touch BEFORE UPDATE ON public.seating_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.seat_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.seating_plans(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  seat_number integer NOT NULL,
  group_label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, student_id),
  UNIQUE (plan_id, room_id, row_number, seat_number)
);
CREATE INDEX seat_allocations_plan_room_idx ON public.seat_allocations (plan_id, room_id);
CREATE INDEX seat_allocations_student_idx ON public.seat_allocations (student_id);

-- E. Professors, Duties & Leaves
CREATE TABLE public.professors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id text NOT NULL UNIQUE,
  name text NOT NULL,
  department text NOT NULL,
  email text NOT NULL,
  phone text,
  max_duties int NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX professors_user_idx ON public.professors(user_id);
CREATE TRIGGER professors_touch BEFORE UPDATE ON public.professors FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.professor_duties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.professors(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  notified boolean NOT NULL DEFAULT false,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professor_id, exam_id, room_id)
);

CREATE TABLE public.professor_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.professors(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  reason text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professor_id, leave_date)
);

-- F. Config & Logs
CREATE TABLE public.smtp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL,
  port int NOT NULL DEFAULT 587,
  username text NOT NULL,
  password text NOT NULL,
  from_address text NOT NULL,
  from_name text NOT NULL DEFAULT 'Exam Office',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type text NOT NULL,
  file_name text,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  total_rows int NOT NULL DEFAULT 0,
  created_count int NOT NULL DEFAULT 0,
  updated_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  action text NOT NULL,
  field_name text,
  old_value text,
  new_value text,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_entity_idx ON public.activity_logs(entity_type, entity_id);

-- Grant access on all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. SECURITY HELPERS & RLS POLICIES (All tables exist now!)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin'::public.app_role, 'staff'::public.app_role))
$$;

CREATE OR REPLACE FUNCTION public.is_professor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'professor'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.is_student(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'student'::public.app_role)
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_professor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_student(uuid) TO authenticated;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seating_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smtp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "profiles select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "roles select" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "courses select" ON public.courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "courses staff" ON public.courses FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "batches select" ON public.batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "batches staff" ON public.batches FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "sections select" ON public.sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sections staff" ON public.sections FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "students select" ON public.students FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "students staff" ON public.students FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "subjects select" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "subjects staff" ON public.subjects FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "student subjects select" ON public.student_subjects FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));
CREATE POLICY "student subjects staff" ON public.student_subjects FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "rooms select" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "rooms staff" ON public.rooms FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "exams select" ON public.exams FOR SELECT TO authenticated USING (true);
CREATE POLICY "exams staff" ON public.exams FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "exam groups select" ON public.exam_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "exam groups staff" ON public.exam_groups FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "seating plans select" ON public.seating_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "seating plans staff" ON public.seating_plans FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "seat allocations select" ON public.seat_allocations FOR SELECT TO authenticated
USING (
  public.is_staff(auth.uid()) OR
  student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()) OR
  room_id IN (
    SELECT d.room_id FROM public.professor_duties d
    JOIN public.professors p ON p.id = d.professor_id
    WHERE p.user_id = auth.uid()
  )
);
CREATE POLICY "seat allocations staff" ON public.seat_allocations FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "professors select" ON public.professors FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "professors staff" ON public.professors FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "professor duties select" ON public.professor_duties FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR professor_id IN (SELECT id FROM public.professors WHERE user_id = auth.uid()));
CREATE POLICY "professor duties staff" ON public.professor_duties FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "professor leaves select" ON public.professor_leaves FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR professor_id IN (SELECT id FROM public.professors WHERE user_id = auth.uid()));
CREATE POLICY "professor leaves apply" ON public.professor_leaves FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()) OR professor_id IN (SELECT id FROM public.professors WHERE user_id = auth.uid()));
CREATE POLICY "professor leaves staff" ON public.professor_leaves FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "smtp admin" ON public.smtp_config FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "import logs staff" ON public.import_logs FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "activity logs staff" ON public.activity_logs FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. SEED DUMMY USERS & SAMPLE WORKING DATA
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_admin_id uuid := gen_random_uuid();
  v_prof_user_id uuid := gen_random_uuid();
  v_stud_user_id uuid := gen_random_uuid();
  
  v_course_id uuid := gen_random_uuid();
  v_batch_id uuid := gen_random_uuid();
  v_section_id uuid := gen_random_uuid();
  v_student_id uuid := gen_random_uuid();
  v_prof_id uuid := gen_random_uuid();
  v_room_id uuid := gen_random_uuid();
  v_exam_id uuid := gen_random_uuid();
  v_plan_id uuid := gen_random_uuid();
  v_subject_id uuid := gen_random_uuid();
BEGIN
  -- A. Admin (admin@exam.com / Admin@123456)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@exam.com') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@exam.com', crypt('Admin@123456', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'University Exam Admin'), now(), now(),
      '', '', '', ''
    );
  ELSE
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@exam.com';
    UPDATE auth.users 
    SET encrypted_password = crypt('Admin@123456', gen_salt('bf')), 
        email_confirmed_at = now(),
        confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = ''
    WHERE id = v_admin_id;
  END IF;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (v_admin_id, v_admin_id, jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@exam.com'), 'email', v_admin_id::text, now(), now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_admin_id, 'University Exam Admin', 'admin@exam.com')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- B. Professor (prof@exam.com / Prof@123456)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'prof@exam.com') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_prof_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'prof@exam.com', crypt('Prof@123456', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Dr. Rajesh Sharma'), now(), now(),
      '', '', '', ''
    );
  ELSE
    SELECT id INTO v_prof_user_id FROM auth.users WHERE email = 'prof@exam.com';
    UPDATE auth.users 
    SET encrypted_password = crypt('Prof@123456', gen_salt('bf')), 
        email_confirmed_at = now(),
        confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = ''
    WHERE id = v_prof_user_id;
  END IF;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (v_prof_user_id, v_prof_user_id, jsonb_build_object('sub', v_prof_user_id::text, 'email', 'prof@exam.com'), 'email', v_prof_user_id::text, now(), now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_prof_user_id, 'Dr. Rajesh Sharma', 'prof@exam.com')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_prof_user_id, 'professor'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- C. Student (student@exam.com / Student@123456)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'student@exam.com') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_stud_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'student@exam.com', crypt('Student@123456', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Aarav Kumar'), now(), now(),
      '', '', '', ''
    );
  ELSE
    SELECT id INTO v_stud_user_id FROM auth.users WHERE email = 'student@exam.com';
    UPDATE auth.users 
    SET encrypted_password = crypt('Student@123456', gen_salt('bf')), 
        email_confirmed_at = now(),
        confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = ''
    WHERE id = v_stud_user_id;
  END IF;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (v_stud_user_id, v_stud_user_id, jsonb_build_object('sub', v_stud_user_id::text, 'email', 'student@exam.com'), 'email', v_stud_user_id::text, now(), now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_stud_user_id, 'Aarav Kumar', 'student@exam.com')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_stud_user_id, 'student'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- D. Course, Batch, Section
  INSERT INTO public.courses (id, name, code)
  VALUES (v_course_id, 'B.Tech Computer Science & Engineering', 'CSE')
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_course_id FROM public.courses WHERE code = 'CSE';

  INSERT INTO public.batches (id, course_id, name, start_year, end_year)
  VALUES (v_batch_id, v_course_id, '2024-2028', 2024, 2028)
  ON CONFLICT (course_id, name) DO NOTHING;
  SELECT id INTO v_batch_id FROM public.batches WHERE course_id = v_course_id AND name = '2024-2028';

  INSERT INTO public.sections (id, batch_id, name)
  VALUES (v_section_id, v_batch_id, 'Section A')
  ON CONFLICT (batch_id, name) DO NOTHING;
  SELECT id INTO v_section_id FROM public.sections WHERE batch_id = v_batch_id AND name = 'Section A';

  -- E. Subject
  INSERT INTO public.subjects (id, code, name, course_id, batch_id, semester)
  VALUES (v_subject_id, 'CS301', 'Data Structures & Algorithms', v_course_id, v_batch_id, 3)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_subject_id FROM public.subjects WHERE course_id = v_course_id AND batch_id = v_batch_id LIMIT 1;

  -- F. Student Record (Aarav Kumar linked to student@exam.com)
  INSERT INTO public.students (id, user_id, registration_number, roll_number, name, email, course_id, batch_id, section_id, status)
  VALUES (v_student_id, v_stud_user_id, 'REG2024001', 'CS-24-01', 'Aarav Kumar', 'student@exam.com', v_course_id, v_batch_id, v_section_id, 'active')
  ON CONFLICT (registration_number) DO UPDATE SET user_id = v_stud_user_id, email = 'student@exam.com'
  RETURNING id INTO v_student_id;

  IF v_subject_id IS NOT NULL THEN
    INSERT INTO public.student_subjects (student_id, subject_id)
    VALUES (v_student_id, v_subject_id)
    ON CONFLICT (student_id, subject_id) DO NOTHING;
  END IF;

  -- G. Professor Record (Dr. Rajesh Sharma linked to prof@exam.com)
  INSERT INTO public.professors (id, user_id, employee_id, name, department, email, phone, max_duties, is_active)
  VALUES (v_prof_id, v_prof_user_id, 'PROF001', 'Dr. Rajesh Sharma', 'Computer Science & Engineering', 'prof@exam.com', '9876543210', 10, true)
  ON CONFLICT (employee_id) DO UPDATE SET user_id = v_prof_user_id
  RETURNING id INTO v_prof_id;

  -- H. Examination Halls & Rooms (Total 880 capacity)
  INSERT INTO public.rooms (block, room_number, row_count, seats_per_row, is_active)
  VALUES 
    ('Main Block', 'Room 101', 6, 6, true),
    ('Main Block', 'Room 102', 6, 6, true),
    ('Main Block', 'Room 103', 6, 6, true),
    ('Main Block', 'Room 104', 6, 6, true),
    ('Main Block', 'Room 201', 6, 7, true),
    ('Main Block', 'Room 202', 6, 7, true),
    ('Science Block', 'Hall S-1', 8, 8, true),
    ('Science Block', 'Hall S-2', 8, 8, true),
    ('Science Block', 'Hall S-3', 8, 8, true),
    ('Lecture Complex', 'LH-101', 10, 10, true),
    ('Lecture Complex', 'LH-102', 10, 10, true),
    ('Auditorium Complex', 'Main Audi', 12, 15, true),
    ('Auditorium Complex', 'Seminar Hall', 10, 8, true)
  ON CONFLICT (block, room_number) DO NOTHING;
  SELECT id INTO v_room_id FROM public.rooms WHERE block = 'Main Block' AND room_number = 'Room 101';

  -- I. Exam
  INSERT INTO public.exams (id, name, exam_date, session)
  VALUES (v_exam_id, 'Mid Semester Examination - Autumn 2026', CURRENT_DATE + interval '7 days', 'morning')
  RETURNING id INTO v_exam_id;

  INSERT INTO public.exam_groups (exam_id, course_id, batch_id)
  VALUES (v_exam_id, v_course_id, v_batch_id)
  ON CONFLICT DO NOTHING;

  -- J. Seating Allocation (Aarav Kumar in Room 101, Row 1, Seat 1)
  INSERT INTO public.seating_plans (id, exam_id, strategy, total_students, rooms_used, professors_per_room)
  VALUES (v_plan_id, v_exam_id, 'mixed_balanced', 1, 1, 1)
  ON CONFLICT (exam_id) DO UPDATE SET total_students = 1
  RETURNING id INTO v_plan_id;

  INSERT INTO public.seat_allocations (plan_id, room_id, student_id, row_number, seat_number, group_label)
  VALUES (v_plan_id, v_room_id, v_student_id, 1, 1, 'CSE-24')
  ON CONFLICT DO NOTHING;

  -- K. Professor Duty (Dr. Rajesh Sharma invigilating Room 101)
  INSERT INTO public.professor_duties (professor_id, exam_id, room_id, notified)
  VALUES (v_prof_id, v_exam_id, v_room_id, true)
  ON CONFLICT (professor_id, exam_id, room_id) DO NOTHING;

  RAISE NOTICE '✅ Multi-role database setup complete!';
END $$;
