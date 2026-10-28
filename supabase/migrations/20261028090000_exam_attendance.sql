-- Exam Attendance Table
-- Shared attendance system for invigilators (professors) and students
CREATE TABLE IF NOT EXISTS public.exam_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'unmarked')),
  marked_by UUID REFERENCES public.professors(id) ON DELETE SET NULL,
  marked_by_name TEXT,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_id)
);

-- Indexes for rapid lookup
CREATE INDEX IF NOT EXISTS idx_exam_attendance_room ON public.exam_attendance(exam_id, room_id);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_student ON public.exam_attendance(student_id);

-- Enable RLS
ALTER TABLE public.exam_attendance ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view attendance
CREATE POLICY "Allow authenticated read exam_attendance"
  ON public.exam_attendance FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users (professors/admins) to insert and update attendance
CREATE POLICY "Allow authenticated insert exam_attendance"
  ON public.exam_attendance FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update exam_attendance"
  ON public.exam_attendance FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
