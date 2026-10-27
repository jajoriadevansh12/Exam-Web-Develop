-- ============================================================================
-- AUTO-LINK SUPABASE AUTH USERS TO PROFESSORS & STUDENTS
-- (Includes Auth User Metadata update so Name displays in Supabase Auth Dashboard)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_name text;
  v_prof_id uuid;
  v_stud_id uuid;
BEGIN
  -- 1. Check if email matches any Professor
  SELECT id, name INTO v_prof_id, v_name
  FROM public.professors
  WHERE LOWER(email) = LOWER(NEW.email)
  LIMIT 1;

  IF v_prof_id IS NOT NULL THEN
    v_role := 'professor'::public.app_role;
    UPDATE public.professors SET user_id = NEW.id WHERE id = v_prof_id;
  ELSE
    -- 2. Check if email matches any Student
    SELECT id, name INTO v_stud_id, v_name
    FROM public.students
    WHERE LOWER(email) = LOWER(NEW.email)
    LIMIT 1;

    IF v_stud_id IS NOT NULL THEN
      v_role := 'student'::public.app_role;
      UPDATE public.students SET user_id = NEW.id WHERE id = v_stud_id;
    ELSE
      -- 3. Check for Admin or Staff
      IF LOWER(NEW.email) LIKE '%admin%' OR (SELECT count(*) FROM public.user_roles) = 0 THEN
        v_role := 'admin'::public.app_role;
      ELSE
        v_role := 'staff'::public.app_role;
      END IF;
    END IF;
  END IF;

  -- 4. Update Profile
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(v_name, NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

  -- 5. Set correct Role in user_roles
  DELETE FROM public.user_roles WHERE user_id = NEW.id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role);

  -- 6. Also update Auth User Metadata so name displays inside Supabase Auth Users tab
  IF v_name IS NOT NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_build_object('full_name', v_name, 'name', v_name)
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger is active
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Auto-link any existing professors and students who already have auth accounts
UPDATE public.professors p
SET user_id = u.id
FROM auth.users u
WHERE LOWER(p.email) = LOWER(u.email) AND (p.user_id IS NULL OR p.user_id != u.id);

UPDATE public.students s
SET user_id = u.id
FROM auth.users u
WHERE LOWER(s.email) = LOWER(u.email) AND (s.user_id IS NULL OR s.user_id != u.id);

-- Clean up and re-sync user_roles for existing accounts
DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT u.id FROM auth.users u JOIN public.professors p ON LOWER(u.email) = LOWER(p.email)
  UNION
  SELECT u.id FROM auth.users u JOIN public.students s ON LOWER(u.email) = LOWER(s.email)
);

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'professor'::public.app_role
FROM auth.users u
JOIN public.professors p ON LOWER(u.email) = LOWER(p.email);

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'student'::public.app_role
FROM auth.users u
JOIN public.students s ON LOWER(u.email) = LOWER(s.email);

-- Update Auth Metadata for all existing accounts
UPDATE auth.users u
SET raw_user_meta_data = jsonb_build_object('full_name', s.name, 'name', s.name)
FROM public.students s
WHERE LOWER(u.email) = LOWER(s.email);

UPDATE auth.users u
SET raw_user_meta_data = jsonb_build_object('full_name', p.name, 'name', p.name)
FROM public.professors p
WHERE LOWER(u.email) = LOWER(p.email);
