-- =============================================================================
-- CAMPUS EXAM SUITE — DEFAULT DEMO ACCOUNTS & INITIAL SEED
-- Run this script in your Supabase Dashboard -> SQL Editor
-- 
-- Sets up:
-- 1. Admin Account:     admin@exam.com   / Admin@123456   (Role: admin)
-- 2. Professor Account: prof@exam.com    / Prof@123456    (Role: professor)
-- 3. Student Account:   student@exam.com / Student@123456  (Role: student)
--
-- Plus complete linked data:
-- - Academic records (CSE Course, 2024-2028 Batch, Section A, CS301 Subject)
-- - Linked Professor (Dr. Rajesh Sharma, PROF001)
-- - Linked Student (Aarav Kumar, REG2024001, CS-24-01)
-- - 13 Examination Halls (Room 101 to Audi)
-- - Mid Semester Examination with active seating plan
-- - Seat Allocation for Aarav Kumar in Room 101
-- - Invigilation duty for Dr. Rajesh Sharma in Room 101
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  -- ---------------------------------------------------------------------------
  -- 1. ADMIN USER (admin@exam.com / Admin@123456)
  -- ---------------------------------------------------------------------------
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

  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_admin_id AND provider = 'email') THEN
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (v_admin_id::text, v_admin_id, jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@exam.com'), 'email', v_admin_id::text, now(), now(), now());
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_admin_id, 'University Exam Admin', 'admin@exam.com')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

  DELETE FROM public.user_roles WHERE user_id = v_admin_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_id, 'admin'::public.app_role);

  -- ---------------------------------------------------------------------------
  -- 2. PROFESSOR USER (prof@exam.com / Prof@123456)
  -- ---------------------------------------------------------------------------
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

  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_prof_user_id AND provider = 'email') THEN
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (v_prof_user_id::text, v_prof_user_id, jsonb_build_object('sub', v_prof_user_id::text, 'email', 'prof@exam.com'), 'email', v_prof_user_id::text, now(), now(), now());
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_prof_user_id, 'Dr. Rajesh Sharma', 'prof@exam.com')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

  DELETE FROM public.user_roles WHERE user_id = v_prof_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_prof_user_id, 'professor'::public.app_role);

  -- ---------------------------------------------------------------------------
  -- 3. STUDENT USER (student@exam.com / Student@123456)
  -- ---------------------------------------------------------------------------
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

  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_stud_user_id AND provider = 'email') THEN
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (v_stud_user_id::text, v_stud_user_id, jsonb_build_object('sub', v_stud_user_id::text, 'email', 'student@exam.com'), 'email', v_stud_user_id::text, now(), now(), now());
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_stud_user_id, 'Aarav Kumar', 'student@exam.com')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

  DELETE FROM public.user_roles WHERE user_id = v_stud_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_stud_user_id, 'student'::public.app_role);

  -- ---------------------------------------------------------------------------
  -- 4. ACADEMIC STRUCTURE (Course, Batch, Section, Subject)
  -- ---------------------------------------------------------------------------
  INSERT INTO public.courses (id, name, code)
  VALUES (v_course_id, 'B.Tech Computer Science & Engineering', 'CSE')
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_course_id;

  INSERT INTO public.batches (id, course_id, name, start_year, end_year)
  VALUES (v_batch_id, v_course_id, '2024-2028', 2024, 2028)
  ON CONFLICT (course_id, name) DO UPDATE SET start_year = EXCLUDED.start_year
  RETURNING id INTO v_batch_id;

  INSERT INTO public.sections (id, batch_id, name)
  VALUES (v_section_id, v_batch_id, 'Section A')
  ON CONFLICT (batch_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_section_id;

  INSERT INTO public.subjects (id, code, name, course_id, batch_id, semester)
  VALUES (v_subject_id, 'CS301', 'Data Structures & Algorithms', v_course_id, v_batch_id, 3)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_subject_id FROM public.subjects WHERE course_id = v_course_id AND batch_id = v_batch_id LIMIT 1;

  -- ---------------------------------------------------------------------------
  -- 5. PROFESSOR RECORD (Dr. Rajesh Sharma linked to prof@exam.com)
  -- ---------------------------------------------------------------------------
  INSERT INTO public.professors (id, user_id, employee_id, name, department, email, phone, max_duties, is_active)
  VALUES (v_prof_id, v_prof_user_id, 'PROF001', 'Dr. Rajesh Sharma', 'Computer Science & Engineering', 'prof@exam.com', '9876543210', 10, true)
  ON CONFLICT (employee_id) DO UPDATE SET user_id = v_prof_user_id, email = 'prof@exam.com', name = EXCLUDED.name
  RETURNING id INTO v_prof_id;

  -- ---------------------------------------------------------------------------
  -- 6. STUDENT RECORD (Aarav Kumar linked to student@exam.com)
  -- ---------------------------------------------------------------------------
  INSERT INTO public.students (id, user_id, registration_number, roll_number, name, email, course_id, batch_id, section_id, status)
  VALUES (v_student_id, v_stud_user_id, 'REG2024001', 'CS-24-01', 'Aarav Kumar', 'student@exam.com', v_course_id, v_batch_id, v_section_id, 'active')
  ON CONFLICT (registration_number) DO UPDATE SET user_id = v_stud_user_id, email = 'student@exam.com', name = EXCLUDED.name
  RETURNING id INTO v_student_id;

  IF v_subject_id IS NOT NULL THEN
    INSERT INTO public.student_subjects (student_id, subject_id)
    VALUES (v_student_id, v_subject_id)
    ON CONFLICT (student_id, subject_id) DO NOTHING;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 7. EXAMINATION HALLS & ROOMS
  -- ---------------------------------------------------------------------------
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

  SELECT id INTO v_room_id FROM public.rooms WHERE block = 'Main Block' AND room_number = 'Room 101' LIMIT 1;

  -- ---------------------------------------------------------------------------
  -- 8. EXAM & SEATING ALLOCATION
  -- ---------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.exams WHERE name = 'Mid Semester Examination - Autumn 2026') THEN
    INSERT INTO public.exams (id, name, exam_date, session)
    VALUES (v_exam_id, 'Mid Semester Examination - Autumn 2026', CURRENT_DATE + interval '7 days', 'morning')
    RETURNING id INTO v_exam_id;
  ELSE
    SELECT id INTO v_exam_id FROM public.exams WHERE name = 'Mid Semester Examination - Autumn 2026' LIMIT 1;
  END IF;

  INSERT INTO public.exam_groups (exam_id, course_id, batch_id)
  VALUES (v_exam_id, v_course_id, v_batch_id)
  ON CONFLICT (exam_id, course_id, batch_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.seating_plans WHERE exam_id = v_exam_id) THEN
    INSERT INTO public.seating_plans (id, exam_id, strategy, total_students, rooms_used, professors_per_room)
    VALUES (v_plan_id, v_exam_id, 'mixed_balanced', 1, 1, 1)
    RETURNING id INTO v_plan_id;
  ELSE
    SELECT id INTO v_plan_id FROM public.seating_plans WHERE exam_id = v_exam_id LIMIT 1;
    UPDATE public.seating_plans SET total_students = 1, rooms_used = 1 WHERE id = v_plan_id;
  END IF;

  IF v_room_id IS NOT NULL AND v_student_id IS NOT NULL AND v_plan_id IS NOT NULL THEN
    INSERT INTO public.seat_allocations (plan_id, room_id, student_id, row_number, seat_number, group_label)
    VALUES (v_plan_id, v_room_id, v_student_id, 1, 1, 'CSE-24')
    ON CONFLICT (plan_id, student_id) DO UPDATE 
    SET room_id = EXCLUDED.room_id, row_number = EXCLUDED.row_number, seat_number = EXCLUDED.seat_number, group_label = EXCLUDED.group_label;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 9. PROFESSOR INVIGILATION DUTY
  -- ---------------------------------------------------------------------------
  IF v_prof_id IS NOT NULL AND v_room_id IS NOT NULL AND v_exam_id IS NOT NULL THEN
    INSERT INTO public.professor_duties (professor_id, exam_id, room_id, notified, notified_at)
    VALUES (v_prof_id, v_exam_id, v_room_id, true, now())
    ON CONFLICT (professor_id, exam_id, room_id) DO NOTHING;
  END IF;

  RAISE NOTICE '=======================================================';
  RAISE NOTICE '✅ DEFAULT DEMO ACCOUNTS READY:';
  RAISE NOTICE '1. Admin:     admin@exam.com   / Admin@123456';
  RAISE NOTICE '2. Professor: prof@exam.com    / Prof@123456';
  RAISE NOTICE '3. Student:   student@exam.com / Student@123456';
  RAISE NOTICE '=======================================================';
END $$;
