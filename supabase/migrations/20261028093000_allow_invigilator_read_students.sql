-- Allow authenticated users (professors, invigilators, staff) to read students and seat allocations
-- This ensures exam attendance rosters display student names and registration numbers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'students' AND policyname = 'allow_authenticated_read_students'
  ) THEN
    CREATE POLICY "allow_authenticated_read_students"
      ON public.students FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'seat_allocations' AND policyname = 'allow_authenticated_read_seat_allocations'
  ) THEN
    CREATE POLICY "allow_authenticated_read_seat_allocations"
      ON public.seat_allocations FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
