import { supabase } from "@/integrations/supabase/client";

export type AttendanceStatus = "present" | "absent" | "unmarked";

export interface AttendanceItem {
  student_id: string;
  status: AttendanceStatus;
  marked_by?: string | null;
  marked_by_name?: string | null;
  marked_at?: string;
}

export interface RoomAttendanceRoster {
  exam_id: string;
  room_id: string;
  last_updated_by?: string | null;
  last_updated_at?: string | null;
  attendance: Record<string, AttendanceStatus>; // student_id -> status
}

const LOCAL_PREFIX = "exam_room_attendance_";

function getLocalKey(examId: string, roomId: string) {
  return `${LOCAL_PREFIX}${examId}_${roomId}`;
}

/**
 * Load room attendance for an exam and room.
 * Multi-invigilator friendly: Shared across all assigned professors.
 */
export async function getRoomAttendance(
  examId: string,
  roomId: string,
): Promise<RoomAttendanceRoster> {
  const result: RoomAttendanceRoster = {
    exam_id: examId,
    room_id: roomId,
    attendance: {},
  };

  // 1. Load from local cache first (instant response)
  try {
    const cached = localStorage.getItem(getLocalKey(examId, roomId));
    if (cached) {
      const parsed = JSON.parse(cached);
      result.attendance = parsed.attendance || {};
      result.last_updated_by = parsed.last_updated_by;
      result.last_updated_at = parsed.last_updated_at;
    }
  } catch {}

  // 2. Fetch from Supabase exam_attendance table
  try {
    const { data, error } = await supabase
      .from("exam_attendance" as any)
      .select("student_id, status, marked_by_name, marked_at")
      .eq("exam_id", examId)
      .eq("room_id", roomId);

    if (!error && data && data.length > 0) {
      data.forEach((row: any) => {
        result.attendance[row.student_id] = row.status as AttendanceStatus;
        if (!result.last_updated_at || new Date(row.marked_at) > new Date(result.last_updated_at)) {
          result.last_updated_at = row.marked_at;
          result.last_updated_by = row.marked_by_name;
        }
      });
      // Update local cache
      try {
        localStorage.setItem(getLocalKey(examId, roomId), JSON.stringify(result));
      } catch {}
    }
  } catch (err) {
    console.warn("Notice: Using shared attendance store:", err);
  }

  return result;
}

/**
 * Save attendance for a room.
 * Callable by any professor assigned to the room.
 */
export async function saveRoomAttendance(params: {
  examId: string;
  roomId: string;
  records: Array<{ student_id: string; status: AttendanceStatus }>;
  markedById?: string | null;
  markedByName?: string | null;
}): Promise<void> {
  const { examId, roomId, records, markedById, markedByName } = params;
  const now = new Date().toISOString();

  // 1. Prepare roster object
  const roster: RoomAttendanceRoster = {
    exam_id: examId,
    room_id: roomId,
    last_updated_by: markedByName || "Invigilator",
    last_updated_at: now,
    attendance: {},
  };

  records.forEach((r) => {
    roster.attendance[r.student_id] = r.status;
  });

  // 2. Save to local storage for instant sync across tabs
  try {
    localStorage.setItem(getLocalKey(examId, roomId), JSON.stringify(roster));
    // Also save individual student lookup keys for student portal
    records.forEach((r) => {
      localStorage.setItem(
        `student_attendance_${r.student_id}_${examId}`,
        JSON.stringify({ status: r.status, marked_at: now, marked_by_name: markedByName }),
      );
    });
  } catch {}

  // 3. Persist to Supabase exam_attendance table
  try {
    const rows = records.map((r) => ({
      exam_id: examId,
      room_id: roomId,
      student_id: r.student_id,
      status: r.status,
      marked_by: markedById || null,
      marked_by_name: markedByName || "Invigilator",
      marked_at: now,
    }));

    await supabase.from("exam_attendance" as any).upsert(rows, {
      onConflict: "exam_id, student_id",
    });
  } catch (err) {
    console.warn("Remote Supabase table sync note:", err);
  }

  // 4. Realtime Broadcast to notify other professors & student portal instantly
  try {
    const channel = supabase.channel(`attendance-${examId}-${roomId}`);
    await channel.send({
      type: "broadcast",
      event: "attendance_update",
      payload: {
        examId,
        roomId,
        attendance: roster.attendance,
        last_updated_by: markedByName,
        last_updated_at: now,
      },
    });
  } catch {}
}

/**
 * Get attendance status for a student across all their exams.
 * Used on Student Portal.
 */
export async function getStudentAttendanceMap(
  studentId: string,
): Promise<Record<string, { status: AttendanceStatus; marked_at?: string; marked_by_name?: string }>> {
  const result: Record<string, { status: AttendanceStatus; marked_at?: string; marked_by_name?: string }> = {};

  // 1. Read local storage cache first
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`student_attendance_${studentId}_`)) {
        const examId = key.replace(`student_attendance_${studentId}_`, "");
        const val = JSON.parse(localStorage.getItem(key) || "{}");
        if (val?.status) {
          result[examId] = val;
        }
      }
    }
  } catch {}

  // 2. Fetch from Supabase
  try {
    const { data, error } = await supabase
      .from("exam_attendance" as any)
      .select("exam_id, status, marked_at, marked_by_name")
      .eq("student_id", studentId);

    if (!error && data && data.length > 0) {
      data.forEach((row: any) => {
        result[row.exam_id] = {
          status: row.status as AttendanceStatus,
          marked_at: row.marked_at,
          marked_by_name: row.marked_by_name,
        };
      });
    }
  } catch {}

  return result;
}
