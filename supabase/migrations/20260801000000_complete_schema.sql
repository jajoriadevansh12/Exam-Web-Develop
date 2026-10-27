-- =============================================================================
-- Migration: Complete Campus Exam Suite Schema
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'professor', 'student');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END; 
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'staff'))
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

CREATE OR REPLACE FUNCTION public.is_professor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'professor')
$$;

CREATE OR REPLACE FUNCTION public.is_student(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'student')
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_professor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_professor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_student(uuid) TO authenticated;

-- Profiles & User Roles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "staff manage roles" ON public.user_roles;
CREATE POLICY "staff manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), NEW.email)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

  IF (SELECT count(*) FROM public.user_roles) = 0 THEN
    v_role := 'admin'::public.app_role;
  ELSE
    v_role := 'staff'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Courses, Batches, Sections
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage courses" ON public.courses;
CREATE POLICY "staff manage courses" ON public.courses FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "students and profs view courses" ON public.courses;
CREATE POLICY "students and profs view courses" ON public.courses FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS courses_touch ON public.courses;
CREATE TRIGGER courses_touch BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_year int NOT NULL,
  end_year int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches TO authenticated;
GRANT ALL ON public.batches TO service_role;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage batches" ON public.batches;
CREATE POLICY "staff manage batches" ON public.batches FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "students and profs view batches" ON public.batches;
CREATE POLICY "students and profs view batches" ON public.batches FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS batches_touch ON public.batches;
CREATE TRIGGER batches_touch BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage sections" ON public.sections;
CREATE POLICY "staff manage sections" ON public.sections FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "students and profs view sections" ON public.sections;
CREATE POLICY "students and profs view sections" ON public.sections FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS sections_touch ON public.sections;
CREATE TRIGGER sections_touch BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Students & Subjects
CREATE TABLE IF NOT EXISTS public.students (
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
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS students_user_idx ON public.students(user_id);
CREATE INDEX IF NOT EXISTS students_batch_idx ON public.students(batch_id);
CREATE INDEX IF NOT EXISTS students_section_idx ON public.students(section_id);
CREATE INDEX IF NOT EXISTS students_roll_idx ON public.students(roll_number);
CREATE INDEX IF NOT EXISTS students_email_idx ON public.students(email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage students" ON public.students;
CREATE POLICY "staff manage students" ON public.students FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "students view own record" ON public.students;
CREATE POLICY "students view own record" ON public.students FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP TRIGGER IF EXISTS students_touch ON public.students;
CREATE TRIGGER students_touch BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text,
  name text NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.batches(id) ON DELETE CASCADE,
  semester integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_unique_name ON public.subjects (course_id, batch_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage subjects" ON public.subjects;
CREATE POLICY "staff manage subjects" ON public.subjects FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "authenticated view subjects" ON public.subjects;
CREATE POLICY "authenticated view subjects" ON public.subjects FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS subjects_touch ON public.subjects;
CREATE TRIGGER subjects_touch BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.student_subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_subjects TO authenticated;
GRANT ALL ON public.student_subjects TO service_role;
ALTER TABLE public.student_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage student subjects" ON public.student_subjects;
CREATE POLICY "staff manage student subjects" ON public.student_subjects FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "students view own subjects" ON public.student_subjects;
CREATE POLICY "students view own subjects" ON public.student_subjects FOR SELECT TO authenticated USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- Rooms, Exams, Exam Groups, Seating Plans, Allocations
CREATE TABLE IF NOT EXISTS public.rooms (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage rooms" ON public.rooms;
CREATE POLICY "staff manage rooms" ON public.rooms FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "authenticated view rooms" ON public.rooms;
CREATE POLICY "authenticated view rooms" ON public.rooms FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS rooms_touch ON public.rooms;
CREATE TRIGGER rooms_touch BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  exam_date date NOT NULL,
  session text NOT NULL DEFAULT 'morning',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.exams TO service_role;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage exams" ON public.exams;
CREATE POLICY "staff manage exams" ON public.exams FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "authenticated view exams" ON public.exams;
CREATE POLICY "authenticated view exams" ON public.exams FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS exams_touch ON public.exams;
CREATE TRIGGER exams_touch BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.exam_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, course_id, batch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_groups TO authenticated;
GRANT ALL ON public.exam_groups TO service_role;
ALTER TABLE public.exam_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage exam groups" ON public.exam_groups;
CREATE POLICY "staff manage exam groups" ON public.exam_groups FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "authenticated view exam groups" ON public.exam_groups;
CREATE POLICY "authenticated view exam groups" ON public.exam_groups FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.seating_plans (
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
ALTER TABLE public.seating_plans ADD COLUMN IF NOT EXISTS professors_per_room integer NOT NULL DEFAULT 1;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seating_plans TO authenticated;
GRANT ALL ON public.seating_plans TO service_role;
ALTER TABLE public.seating_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage seating plans" ON public.seating_plans;
CREATE POLICY "staff manage seating plans" ON public.seating_plans FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "authenticated view seating plans" ON public.seating_plans;
CREATE POLICY "authenticated view seating plans" ON public.seating_plans FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS seating_plans_touch ON public.seating_plans;
CREATE TRIGGER seating_plans_touch BEFORE UPDATE ON public.seating_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.seat_allocations (
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
CREATE INDEX IF NOT EXISTS seat_allocations_plan_room_idx ON public.seat_allocations (plan_id, room_id);
CREATE INDEX IF NOT EXISTS seat_allocations_student_idx ON public.seat_allocations (student_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seat_allocations TO authenticated;
GRANT ALL ON public.seat_allocations TO service_role;
ALTER TABLE public.seat_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage seat allocations" ON public.seat_allocations;
CREATE POLICY "staff manage seat allocations" ON public.seat_allocations FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "students view own seat allocations" ON public.seat_allocations;
CREATE POLICY "students view own seat allocations" ON public.seat_allocations FOR SELECT TO authenticated USING (
  student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
);

-- Professors, Duties & Leaves
CREATE TABLE IF NOT EXISTS public.professors (
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
CREATE INDEX IF NOT EXISTS professors_user_idx ON public.professors(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professors TO authenticated;
GRANT ALL ON public.professors TO service_role;
ALTER TABLE public.professors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage professors" ON public.professors;
CREATE POLICY "staff manage professors" ON public.professors FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "professors view own profile" ON public.professors;
CREATE POLICY "professors view own profile" ON public.professors FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP TRIGGER IF EXISTS professors_touch ON public.professors;
CREATE TRIGGER professors_touch BEFORE UPDATE ON public.professors FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.professor_duties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.professors(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  notified boolean NOT NULL DEFAULT false,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professor_id, exam_id, room_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professor_duties TO authenticated;
GRANT ALL ON public.professor_duties TO service_role;
ALTER TABLE public.professor_duties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage duties" ON public.professor_duties;
CREATE POLICY "staff manage duties" ON public.professor_duties FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "professors view own duties" ON public.professor_duties;
CREATE POLICY "professors view own duties" ON public.professor_duties FOR SELECT TO authenticated USING (
  professor_id IN (SELECT id FROM public.professors WHERE user_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS public.professor_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.professors(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  reason text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professor_id, leave_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professor_leaves TO authenticated;
GRANT ALL ON public.professor_leaves TO service_role;
ALTER TABLE public.professor_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage leaves" ON public.professor_leaves;
CREATE POLICY "staff manage leaves" ON public.professor_leaves FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "professors view own leaves" ON public.professor_leaves;
CREATE POLICY "professors view own leaves" ON public.professor_leaves FOR SELECT TO authenticated USING (
  professor_id IN (SELECT id FROM public.professors WHERE user_id = auth.uid())
);

-- SMTP Config & Logs
CREATE TABLE IF NOT EXISTS public.smtp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL,
  port int NOT NULL DEFAULT 587,
  username text NOT NULL,
  password text NOT NULL,
  from_address text NOT NULL,
  from_name text NOT NULL DEFAULT 'Exam Office',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.smtp_config TO authenticated;
GRANT ALL ON public.smtp_config TO service_role;
ALTER TABLE public.smtp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin only smtp" ON public.smtp_config;
CREATE POLICY "admin only smtp" ON public.smtp_config FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type text NOT NULL,
  file_name text,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  total_rows int NOT NULL DEFAULT 0,
  created_count int NOT NULL DEFAULT 0,
  updated_count int NOT NULL DEFAULT 0,
  unchanged_count int NOT NULL DEFAULT 0,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.import_logs TO authenticated;
GRANT ALL ON public.import_logs TO service_role;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage import logs" ON public.import_logs;
CREATE POLICY "staff manage import logs" ON public.import_logs FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.activity_logs (
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
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage activity logs" ON public.activity_logs;
CREATE POLICY "staff manage activity logs" ON public.activity_logs FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
