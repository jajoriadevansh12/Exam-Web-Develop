import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function unwrap(result) {
  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

/* ------------------------------------------------------------------ */
/* Professors CRUD                                                     */
/* ------------------------------------------------------------------ */

export async function listProfessors() {
  return unwrap(
    await supabase
      .from("professors")
      .select("*")
      .order("name"),
  );
}

export async function createProfessor(input) {
  const row = unwrap(
    await supabase
      .from("professors")
      .insert(input)
      .select()
      .single(),
  );

  await logActivity({
    entity_type: "professor",
    entity_id: row.id,
    entity_label: row.employee_id,
    action: "created",
  });

  return row;
}

export async function updateProfessor(id, input) {
  const row = unwrap(
    await supabase
      .from("professors")
      .update(input)
      .eq("id", id)
      .select()
      .single(),
  );

  await logActivity({
    entity_type: "professor",
    entity_id: id,
    entity_label: row.employee_id,
    action: "updated",
  });

  return row;
}

export async function deleteProfessor(id) {
  const result = await supabase
    .from("professors")
    .delete()
    .eq("id", id);

  if (result.error) {
    throw new Error(result.error.message);
  }

  await logActivity({
    entity_type: "professor",
    entity_id: id,
    action: "deleted",
  });
}

/* ------------------------------------------------------------------ */
/* Professor Excel Import                                               */
/* ------------------------------------------------------------------ */

export async function importProfessorsFromRows(rows) {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const errors = [];

  for (const raw of rows) {
    const employeeId = String(
      raw["Employee ID"] ??
        raw["employee_id"] ??
        "",
    ).trim();

    const name = String(
      raw["Name"] ??
        raw["name"] ??
        "",
    ).trim();

    const department = String(
      raw["Department"] ??
        raw["department"] ??
        "",
    ).trim();

    const email = String(
      raw["Email"] ??
        raw["email"] ??
        "",
    ).trim();

    const phone =
      String(
        raw["Phone"] ??
          raw["phone"] ??
          "",
      ).trim() || null;

    const maxDuties =
      parseInt(
        raw["Max Duties"] ??
          raw["max_duties"] ??
          "10",
        10,
      ) || 10;

    if (
      !employeeId ||
      !name ||
      !department ||
      !email
    ) {
      errors.push(
        `Row skipped — missing required field (Employee ID: "${employeeId}")`,
      );

      skipped++;
      continue;
    }

    const { data: existing, error: existingError } =
      await supabase
        .from("professors")
        .select(
          "id, name, department, email, phone, max_duties",
        )
        .eq("employee_id", employeeId)
        .maybeSingle();

    if (existingError) {
      errors.push(
        `Could not check ${employeeId}: ${existingError.message}`,
      );

      skipped++;
      continue;
    }

    if (existing) {
      const patch = {};

      if (existing.name !== name) {
        patch.name = name;
      }

      if (existing.department !== department) {
        patch.department = department;
      }

      if (existing.email !== email) {
        patch.email = email;
      }

      if (phone !== null) {
        patch.phone = phone;
      }

      patch.max_duties = maxDuties;

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from("professors")
          .update(patch)
          .eq("id", existing.id);

        if (error) {
          errors.push(
            `Update failed for ${employeeId}: ${error.message}`,
          );

          skipped++;
          continue;
        }

        updated++;
      } else {
        skipped++;
      }
    } else {
      const { error } = await supabase
        .from("professors")
        .insert({
          employee_id: employeeId,
          name,
          department,
          email,
          phone,
          max_duties: maxDuties,
          is_active: true,
        });

      if (error) {
        errors.push(
          `Insert failed for ${employeeId}: ${error.message}`,
        );

        skipped++;
        continue;
      }

      created++;
    }
  }

  await logActivity({
    entity_type: "professor_import",
    action: "imported",
    new_value: `created:${created} updated:${updated} skipped:${skipped}`,
  });

  return {
    created,
    updated,
    skipped,
    errors,
  };
}

/* ------------------------------------------------------------------ */
/* Duties                                                               */
/* ------------------------------------------------------------------ */

export async function listDuties(examId) {
  let query = supabase
    .from("professor_duties")
    .select(
      `
        *,
        professors (
          name,
          email,
          employee_id,
          department
        ),
        exams (
          name,
          exam_date,
          session
        ),
        rooms (
          block,
          room_number,
          capacity
        )
      `,
    );

  if (examId) {
    query = query.eq("exam_id", examId);
  }

  return unwrap(
    await query.order("created_at", {
      ascending: true,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Check Professor Availability                                         */
/* ------------------------------------------------------------------ */

async function checkProfessorAvailability(
  professorId,
  examId,
  roomId,
) {
  /* Get exam information */

  const examResult = await supabase
    .from("exams")
    .select("id, exam_date, session, name")
    .eq("id", examId)
    .single();

  if (examResult.error) {
    throw new Error(
      `Exam could not be loaded: ${examResult.error.message}`,
    );
  }

  const exam = examResult.data;

  /* Get professor */

  const professorResult = await supabase
    .from("professors")
    .select(
      "id, name, employee_id, email, max_duties, is_active",
    )
    .eq("id", professorId)
    .single();

  if (professorResult.error) {
    throw new Error(
      `Professor could not be loaded: ${professorResult.error.message}`,
    );
  }

  const professor = professorResult.data;

  /* Active check */

  if (!professor.is_active) {
    throw new Error(
      `${professor.name} is inactive and cannot be assigned.`,
    );
  }

  /* Leave check - only approved leaves block duty assignment */

  const leaveResult = await supabase
    .from("professor_leaves")
    .select("id, leave_date, reason, approved")
    .eq("professor_id", professorId)
    .eq("leave_date", exam.exam_date)
    .eq("approved", true);

  if (leaveResult.error) {
    throw new Error(
      `Leave check failed: ${leaveResult.error.message}`,
    );
  }

  if ((leaveResult.data ?? []).length > 0) {
    const reason =
      leaveResult.data[0]?.reason;

    throw new Error(
      `${professor.name} is on approved leave on ${exam.exam_date}${
        reason ? ` (${reason})` : ""
      }.`,
    );
  }

  /* Existing duty in same exam */

  const sameExamResult = await supabase
    .from("professor_duties")
    .select(
      `
        id,
        room_id,
        rooms (
          block,
          room_number
        )
      `,
    )
    .eq("professor_id", professorId)
    .eq("exam_id", examId);

  if (sameExamResult.error) {
    throw new Error(
      `Existing duty check failed: ${sameExamResult.error.message}`,
    );
  }

  const sameExamDuties =
    sameExamResult.data ?? [];

  /* Same room */

  const sameRoom = sameExamDuties.find(
    (duty) => duty.room_id === roomId,
  );

  if (sameRoom) {
    const roomName = sameRoom.rooms
      ? `${sameRoom.rooms.block}/${sameRoom.rooms.room_number}`
      : "this room";

    throw new Error(
      `${professor.name} is already assigned to ${roomName} for this exam.`,
    );
  }

  /* Same exam, another room */

  if (sameExamDuties.length > 0) {
    const roomNames = sameExamDuties
      .map((duty) =>
        duty.rooms
          ? `${duty.rooms.block}/${duty.rooms.room_number}`
          : "another room",
      )
      .join(", ");

    throw new Error(
      `${professor.name} is already assigned to this exam (${roomNames}).`,
    );
  }

  /* Max duty check */

  const dutyCountResult = await supabase
    .from("professor_duties")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("professor_id", professorId);

  if (dutyCountResult.error) {
    throw new Error(
      `Duty count check failed: ${dutyCountResult.error.message}`,
    );
  }

  const currentDuties =
    dutyCountResult.count ?? 0;

  const maxDuties =
    Number(professor.max_duties ?? 10);

  if (currentDuties >= maxDuties) {
    throw new Error(
      `${professor.name} has reached the maximum duty limit (${maxDuties}).`,
    );
  }

  return {
    professor,
    exam,
    currentDuties,
  };
}

/* ------------------------------------------------------------------ */
/* Assign Single Duty                                                   */
/* ------------------------------------------------------------------ */

export async function assignDuty(input) {
  const {
    professor_id,
    exam_id,
    room_id,
  } = input;

  if (!professor_id) {
    throw new Error(
      "Please select a professor.",
    );
  }

  if (!exam_id) {
    throw new Error(
      "Please select an examination.",
    );
  }

  if (!room_id) {
    throw new Error(
      "Please select an examination hall.",
    );
  }

  /* Validate everything before insert */

  const validation =
    await checkProfessorAvailability(
      professor_id,
      exam_id,
      room_id,
    );

  /* Insert */

  const insertResult = await supabase
    .from("professor_duties")
    .insert({
      professor_id,
      exam_id,
      room_id,
      notified: false,
    })
    .select(
      `
        *,
        professors (
          name,
          email,
          employee_id,
          department
        ),
        exams (
          name,
          exam_date,
          session
        ),
        rooms (
          block,
          room_number
        )
      `,
    )
    .single();

  if (insertResult.error) {
    throw new Error(
      `Duty assignment failed: ${insertResult.error.message}`,
    );
  }

  const row = insertResult.data;

  await logActivity({
    entity_type: "professor_duty",
    entity_id: row.id,
    entity_label: `${validation.professor.name} → ${
      row.rooms
        ? `${row.rooms.block}/${row.rooms.room_number}`
        : room_id
    }`,
    action: "assigned",
  });

  return row;
}

/* ------------------------------------------------------------------ */
/* Remove Duty                                                         */
/* ------------------------------------------------------------------ */

export async function removeDuty(id) {
  if (!id) {
    throw new Error(
      "Duty ID is required.",
    );
  }

  const result = await supabase
    .from("professor_duties")
    .delete()
    .eq("id", id);

  if (result.error) {
    throw new Error(
      `Could not remove duty: ${result.error.message}`,
    );
  }

  await logActivity({
    entity_type: "professor_duty",
    entity_id: id,
    action: "removed",
  });
}

/* ------------------------------------------------------------------ */
/* Auto Assign Professors                                               */
/* ------------------------------------------------------------------ */

export async function autoAssignProfessors(
  examId,
  roomIds,
  professorsPerRoom = 1,
) {
  if (!examId) {
    throw new Error(
      "Exam is required.",
    );
  }

  if (!Array.isArray(roomIds) || roomIds.length === 0) {
    // If not explicitly provided, find the rooms that have students seated in the seating plan!
    const { data: plan } = await supabase
      .from("seating_plans")
      .select("id")
      .eq("exam_id", examId)
      .maybeSingle();

    if (plan) {
      const { data: allocations } = await supabase
        .from("seat_allocations")
        .select("room_id")
        .eq("plan_id", plan.id);

      if (allocations && allocations.length > 0) {
        roomIds = [...new Set(allocations.map((a) => a.room_id))];
      }
    }

    if (!roomIds || roomIds.length === 0) {
      throw new Error(
        "No examination halls selected, and no seating plan with seated students found for this exam.",
      );
    }
  }

  professorsPerRoom = Number(
    professorsPerRoom,
  );

  if (
    !Number.isInteger(professorsPerRoom) ||
    professorsPerRoom < 1 ||
    professorsPerRoom > 3
  ) {
    throw new Error(
      "Professors per room must be between 1 and 3.",
    );
  }

  /* Exam */

  const examResult = await supabase
    .from("exams")
    .select(
      "id, name, exam_date, session",
    )
    .eq("id", examId)
    .single();

  if (examResult.error) {
    throw new Error(
      `Exam not found: ${examResult.error.message}`,
    );
  }

  const exam = examResult.data;

  /* Active professors */

  const professorsResult =
    await supabase
      .from("professors")
      .select("*")
      .eq("is_active", true);

  const professors = unwrap(
    professorsResult,
  );

  if (!professors?.length) {
    throw new Error(
      "No active professors found.",
    );
  }

  /* Leave list - only approved leaves exclude professors from duty assignment */

  const leaveResult = await supabase
    .from("professor_leaves")
    .select("professor_id")
    .eq("leave_date", exam.exam_date)
    .eq("approved", true);

  if (leaveResult.error) {
    throw new Error(
      `Could not check professor leaves: ${leaveResult.error.message}`,
    );
  }

  const onLeave = new Set(
    (leaveResult.data ?? []).map(
      (leave) => leave.professor_id,
    ),
  );

  /* Existing duties for this exam */

  const existingResult = await supabase
    .from("professor_duties")
    .select(
      `
        id,
        professor_id,
        room_id
      `,
    )
    .eq("exam_id", examId);

  if (existingResult.error) {
    throw new Error(
      `Could not load existing duties: ${existingResult.error.message}`,
    );
  }

  const existingDuties =
    existingResult.data ?? [];

  /* Professors already assigned to this exam */

  const alreadyAssignedProfessors =
    new Set(
      existingDuties.map(
        (duty) => duty.professor_id,
      ),
    );

  /* Rooms already assigned */

  const roomDutyCounts = {};

  for (const duty of existingDuties) {
    roomDutyCounts[duty.room_id] =
      (roomDutyCounts[duty.room_id] ?? 0) +
      1;
  }

  /* Duty counts */

  const dutyCounts = {};

  for (const professor of professors) {
    const result = await supabase
      .from("professor_duties")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq(
        "professor_id",
        professor.id,
      );

    if (result.error) {
      throw new Error(
        `Could not calculate duties for ${professor.name}: ${result.error.message}`,
      );
    }

    dutyCounts[professor.id] =
      result.count ?? 0;
  }

  /*
   * Available professors:
   *
   * 1. Active
   * 2. Not on leave
   * 3. Not already assigned to this exam
   * 4. Below max duty limit
   */

  const available =
    professors
      .filter(
        (professor) =>
          !onLeave.has(
            professor.id,
          ),
      )
      .filter(
        (professor) =>
          !alreadyAssignedProfessors.has(
            professor.id,
          ),
      )
      .filter(
        (professor) =>
          dutyCounts[professor.id] <
          Number(
            professor.max_duties ?? 10,
          ),
      )
      .sort(
        (a, b) =>
          (dutyCounts[a.id] ?? 0) -
          (dutyCounts[b.id] ?? 0),
      );

  const requiredSlots =
    roomIds.reduce(
      (total, roomId) => {
        const existing =
          roomDutyCounts[roomId] ?? 0;

        const required = Math.max(
          professorsPerRoom -
            existing,
          0,
        );

        return total + required;
      },
      0,
    );

  if (
    available.length <
    requiredSlots
  ) {
    throw new Error(
      `Not enough available professors. Required: ${requiredSlots}, Available: ${available.length}. Check professor leaves, maximum duties and existing assignments.`,
    );
  }

  const assignments = [];

  let pointer = 0;

  for (const roomId of roomIds) {
    const existing =
      roomDutyCounts[roomId] ?? 0;

    const slotsNeeded = Math.max(
      professorsPerRoom -
        existing,
      0,
    );

    for (
      let slot = 0;
      slot < slotsNeeded;
      slot++
    ) {
      if (
        pointer >=
        available.length
      ) {
        throw new Error(
          "Professor allocation stopped because no eligible professor remained.",
        );
      }

      const professor =
        available[pointer];

      pointer++;

      const duty =
        await assignDuty({
          professor_id:
            professor.id,
          exam_id: examId,
          room_id: roomId,
        });

      assignments.push(duty);

      /*
       * Update local state so the same professor
       * cannot be selected again during this run.
       */

      alreadyAssignedProfessors.add(
        professor.id,
      );

      dutyCounts[
        professor.id
      ] =
        (dutyCounts[
          professor.id
        ] ?? 0) + 1;
    }
  }

  return assignments;
}

/* ------------------------------------------------------------------ */
/* Professor Duty Statistics                                            */
/* ------------------------------------------------------------------ */

export async function getProfessorStats() {
  const professors = unwrap(
    await supabase
      .from("professors")
      .select("*")
      .order("name"),
  );

  const stats = [];

  for (const professor of professors) {
    const {
      count: total,
      error: totalError,
    } = await supabase
      .from("professor_duties")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq(
        "professor_id",
        professor.id,
      );

    if (totalError) {
      throw new Error(
        `Could not get duty stats for ${professor.name}: ${totalError.message}`,
      );
    }

    stats.push({
      ...professor,
      total_duties: total ?? 0,
      upcoming_duties: total ?? 0,
    });
  }

  return stats;
}

/* ------------------------------------------------------------------ */
/* Leave Management                                                     */
/* ------------------------------------------------------------------ */

export async function listLeaves(professorId) {
  let query = supabase
    .from("professor_leaves")
    .select("*, professors(name, employee_id, department, email)");

  if (professorId) {
    query = query.eq("professor_id", professorId);
  }

  return unwrap(
    await query.order("leave_date", { ascending: false }),
  );
}

export async function addLeave(input) {
  return unwrap(
    await supabase
      .from("professor_leaves")
      .insert(input)
      .select()
      .single(),
  );
}

export async function approveLeave(id) {
  if (!id) {
    throw new Error("Leave ID is required.");
  }

  const { data: leave, error: fetchErr } = await supabase
    .from("professor_leaves")
    .select("*, professors(name, employee_id)")
    .eq("id", id)
    .single();

  if (fetchErr) {
    throw new Error(`Could not load leave record: ${fetchErr.message}`);
  }

  let cleanedReason = leave.reason || "";
  if (cleanedReason.startsWith("[REJECTED] ")) {
    cleanedReason = cleanedReason.replace("[REJECTED] ", "").trim();
  }

  const { data: updated, error: updateErr } = await supabase
    .from("professor_leaves")
    .update({ approved: true, reason: cleanedReason })
    .eq("id", id)
    .select("*, professors(name, employee_id)")
    .single();

  if (updateErr) {
    throw new Error(`Failed to approve leave: ${updateErr.message}`);
  }

  // Check if professor already had an assigned duty on this date and automatically unassign!
  const { data: duties, error: dutiesErr } = await supabase
    .from("professor_duties")
    .select("id, exam_id, exams!inner(exam_date, name)")
    .eq("professor_id", leave.professor_id)
    .eq("exams.exam_date", leave.leave_date);

  let unassignedCount = 0;
  if (!dutiesErr && duties && duties.length > 0) {
    for (const duty of duties) {
      await supabase.from("professor_duties").delete().eq("id", duty.id);
      unassignedCount++;
    }
  }

  await logActivity({
    entity_type: "professor_leave",
    entity_id: id,
    entity_label: `${leave.professors?.name || "Professor"} (${leave.leave_date})`,
    action: "approved",
    new_value: unassignedCount > 0 ? `Unassigned ${unassignedCount} conflicting duty` : "Approved",
  });

  return {
    ...updated,
    unassignedDuties: unassignedCount,
  };
}

export async function rejectLeave(id, rejectionReason = "") {
  if (!id) {
    throw new Error("Leave ID is required.");
  }

  const { data: leave, error: fetchErr } = await supabase
    .from("professor_leaves")
    .select("*, professors(name, employee_id)")
    .eq("id", id)
    .single();

  if (fetchErr) {
    throw new Error(`Could not load leave record: ${fetchErr.message}`);
  }

  let baseReason = leave.reason || "";
  if (baseReason.startsWith("[REJECTED] ")) {
    baseReason = baseReason.replace("[REJECTED] ", "").trim();
  }

  const prefix = rejectionReason ? `[REJECTED] ${rejectionReason.trim()} - ` : "[REJECTED] ";
  const newReason = `${prefix}${baseReason}`.trim();

  const { data: updated, error: updateErr } = await supabase
    .from("professor_leaves")
    .update({ approved: false, reason: newReason })
    .eq("id", id)
    .select("*, professors(name, employee_id)")
    .single();

  if (updateErr) {
    throw new Error(`Failed to reject leave: ${updateErr.message}`);
  }

  await logActivity({
    entity_type: "professor_leave",
    entity_id: id,
    entity_label: `${leave.professors?.name || "Professor"} (${leave.leave_date})`,
    action: "rejected",
  });

  return updated;
}

export async function revertLeaveToPending(id) {
  if (!id) {
    throw new Error("Leave ID is required.");
  }

  const { data: leave, error: fetchErr } = await supabase
    .from("professor_leaves")
    .select("reason")
    .eq("id", id)
    .single();

  if (fetchErr) {
    throw new Error(`Could not load leave record: ${fetchErr.message}`);
  }

  let cleanedReason = (leave.reason || "").replace("[REJECTED] ", "").trim();

  const { data: updated, error: updateErr } = await supabase
    .from("professor_leaves")
    .update({ approved: false, reason: cleanedReason })
    .eq("id", id)
    .select("*, professors(name, employee_id)")
    .single();

  if (updateErr) {
    throw new Error(`Failed to reset leave status: ${updateErr.message}`);
  }

  return updated;
}

export async function removeLeave(id) {
  const result = await supabase
    .from("professor_leaves")
    .delete()
    .eq("id", id);

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Leave Excel Import                                                   */
/* ------------------------------------------------------------------ */

export async function importLeavesFromRows(
  rows,
) {
  let created = 0;
  let skipped = 0;

  const errors = [];
  const conflicts = [];

  for (const raw of rows) {
    const employeeId = String(
      raw["Employee ID"] ??
        raw["employee_id"] ??
        "",
    ).trim();

    const rawDate =
      raw["Leave Date"] ??
      raw["leave_date"] ??
      "";

    const reason =
      String(
        raw["Reason"] ??
          raw["reason"] ??
          "",
      ).trim() || null;

    let leaveDate;

    if (
      typeof rawDate ===
      "number"
    ) {
      const date = new Date(
        Math.round(
          (rawDate - 25569) *
            86400 *
            1000,
        ),
      );

      leaveDate =
        date
          .toISOString()
          .split("T")[0];
    } else if (
      rawDate instanceof Date
    ) {
      leaveDate =
        rawDate
          .toISOString()
          .split("T")[0];
    } else {
      leaveDate =
        String(rawDate).trim();
    }

    if (
      !employeeId ||
      !leaveDate
    ) {
      errors.push(
        "Row skipped — Employee ID or Leave Date missing",
      );

      skipped++;
      continue;
    }

    const professorResult =
      await supabase
        .from("professors")
        .select(
          "id, name",
        )
        .eq(
          "employee_id",
          employeeId,
        )
        .single();

    if (
      professorResult.error ||
      !professorResult.data
    ) {
      errors.push(
        `Professor not found: ${employeeId}`,
      );

      skipped++;
      continue;
    }

    const professor =
      professorResult.data;

    const insertResult =
      await supabase
        .from("professor_leaves")
        .insert({
          professor_id:
            professor.id,
          leave_date:
            leaveDate,
          reason,
        });

    if (
      insertResult.error &&
      insertResult.error.code !==
        "23505"
    ) {
      errors.push(
        `Error for ${employeeId} on ${leaveDate}: ${insertResult.error.message}`,
      );

      skipped++;
      continue;
    }

    if (!insertResult.error) {
      created++;
    }

    /* Check existing duty conflict */

    const dutyResult =
      await supabase
        .from("professor_duties")
        .select(
          `
            id,
            exams (
              name,
              exam_date
            ),
            rooms (
              block,
              room_number
            )
          `,
        )
        .eq(
          "professor_id",
          professor.id,
        );

    if (dutyResult.error) {
      errors.push(
        `Could not check duties for ${employeeId}: ${dutyResult.error.message}`,
      );

      continue;
    }

    const clashes =
      (dutyResult.data ?? [])
        .filter(
          (duty) =>
            duty.exams?.exam_date ===
            leaveDate,
        );

    for (const clash of clashes) {
      conflicts.push({
        professor:
          professor.name,
        employee_id:
          employeeId,
        leave_date:
          leaveDate,
        exam:
          clash.exams?.name,
        room: clash.rooms
          ? `${clash.rooms.block}/${clash.rooms.room_number}`
          : "—",
        duty_id:
          clash.id,
      });
    }
  }

  return {
    created,
    skipped,
    errors,
    conflicts,
  };
}