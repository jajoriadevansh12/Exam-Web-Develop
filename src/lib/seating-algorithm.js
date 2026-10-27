/**
 * seating-algorithm.js
 * 
 * Strategies:
 *   - 'alternate' or 'alternate_columns':
 *     Merge 2+ classes/groups in alternating columns (Col 1: Class A, Col 2: Class B, Col 3: Class A...)
 *     Filled top-to-bottom within each column. Ensures zero adjacent cheating between desks.
 *   - 'column_wise':
 *     Sequential column-by-column fill (finishes one group before moving to the next).
 *   - 'checkerboard':
 *     Row-major interleaved seating (alternates student by student across rows and columns).
 * 
 * Room Allocation Modes (fillMode):
 *   - 'pack_rooms' (Default):
 *     Fills rooms completely (100% full). Only the last room has vacant seats.
 *   - 'balanced':
 *     Distributes students evenly across all selected rooms.
 */

/**
 * Extracts a 4-digit admission year or year ordinal (e.g. 2024, 2023, "2nd Yr") from a string.
 */
export function extractYear(str = "") {
  if (!str) return null;
  const match4 = str.match(/\b(19\d\d|20\d\d)\b/);
  if (match4) return match4[1];
  const matchYr = str.match(/\b([1-4])(?:st|nd|rd|th)?\s*(?:yr|year)\b/i);
  if (matchYr) return `Yr-${matchYr[1]}`;
  return null;
}

/**
 * Gets normalized admission or academic year for a group/batch.
 */
export function getGroupYear(g) {
  if (!g) return null;
  if (g.start_year) return String(g.start_year);
  return extractYear(g.batch_name || g.label || "");
}

/**
 * Validates whether two classes / batches are allowed to be merged in alternate seating.
 * Key Business Rule:
 *   - Same course AND same year CANNOT be merged! (e.g. B.Tech 2024 with B.Tech 2024 is forbidden)
 *   - MUST be different admission years (e.g. B.Tech 2023 with B.Tech 2024)
 *   - OR different courses (e.g. B.Tech with MBA, or B.Tech with B.Com)
 */
export function validateMergePair(groupA, groupB) {
  if (!groupA || !groupB) {
    return { valid: false, reason: "Incomplete merge pair selected." };
  }

  // Same Batch ID or same batch key is strictly forbidden
  const batchIdA = groupA.batch_id || groupA.key || groupA.value;
  const batchIdB = groupB.batch_id || groupB.key || groupB.value;
  if (batchIdA && batchIdB && batchIdA === batchIdB) {
    return {
      valid: false,
      reason: "Alternate seating cannot be applied to the same batch. Two distinct batches are required.",
      type: "same_batch",
    };
  }

  const courseA = (groupA.course_code || groupA.course_name || (groupA.label || "").split(" ")[0] || "").trim().toUpperCase();
  const courseB = (groupB.course_code || groupB.course_name || (groupB.label || "").split(" ")[0] || "").trim().toUpperCase();

  const yearA = getGroupYear(groupA);
  const yearB = getGroupYear(groupB);

  // If same course and same year, MERGE IS PROHIBITED
  if (courseA && courseB && courseA === courseB) {
    if (yearA && yearB && yearA === yearB) {
      return {
        valid: false,
        reason: `Same Year & Same Course (${courseA} ${yearA}) cannot be merged. Merge is only allowed between different batches/years or different courses.`,
        type: "same_year_same_course",
      };
    }
  }

  const isDiffYear = Boolean(yearA && yearB && yearA !== yearB);
  const isDiffCourse = Boolean(courseA && courseB && courseA !== courseB);

  return {
    valid: isDiffCourse || isDiffYear,
    reason: isDiffCourse
      ? `Different Courses (${courseA} ⇄ ${courseB})`
      : `Different Admission Years (${yearA} ⇄ ${yearB})`,
    type: isDiffCourse ? "diff_course" : "diff_year",
  };
}

/**
 * Smart pairing for alternate row seating:
 * Merges 2 different batches/years.
 * Priority 1: Same course, different years/batches (e.g. CSE 2023 + CSE 2024).
 * Priority 2: Fallback across different courses (e.g. CSE + B.Com, MBA).
 * Rule: NEVER pair same course AND same year together!
 *
 * Returns two streams of queues:
 *   streamA: Queues for Row 0, Row 2, Row 4...
 *   streamB: Queues for Row 1, Row 3, Row 5...
 */
export function pairQueuesForAlternate(queues) {
  // Check if at least 2 distinct batches exist across queues
  const getBatchKey = (q) => q.batch_id || `${q.course_id || q.course_code || ""}_${q.batch_name || getGroupYear(q) || ""}`;
  const distinctKeys = new Set(queues.map(getBatchKey));
  if (distinctKeys.size < 2) {
    // Only 1 batch present - CANNOT alternate with same batch!
    return { streamA: [...queues], streamB: [] };
  }

  // Group by Course
  const byCourse = new Map();
  for (const q of queues) {
    const rawCourse =
      q.course_code ||
      q.course_name ||
      q.label.split("·")[0].split(" ")[0] ||
      "GENERAL";
    const key = rawCourse.trim().toUpperCase();
    if (!byCourse.has(key)) byCourse.set(key, []);
    byCourse.get(key).push(q);
  }

  const streamA = [];
  const streamB = [];
  const leftovers = [];

  // Priority 1: Pair different years within the same course
  for (const [, list] of byCourse) {
    // Group items inside this course by year
    const byYear = new Map();
    for (const item of list) {
      const yr = getGroupYear(item) || "UNKNOWN";
      if (!byYear.has(yr)) byYear.set(yr, []);
      byYear.get(yr).push(item);
    }

    const distinctYears = [...byYear.keys()];
    // While we have at least 2 different years in this course, pair them
    while (distinctYears.length >= 2) {
      const yr1 = distinctYears[0];
      const yr2 = distinctYears[1];

      const itemA = byYear.get(yr1).shift();
      const itemB = byYear.get(yr2).shift();

      streamA.push(itemA);
      streamB.push(itemB);

      if (byYear.get(yr1).length === 0) distinctYears.splice(0, 1);
      const idx2 = distinctYears.indexOf(yr2);
      if (idx2 !== -1 && byYear.get(yr2).length === 0) distinctYears.splice(idx2, 1);
    }

    // Remaining items of this course (all of the same year) cannot pair with each other!
    for (const yr of distinctYears) {
      for (const item of byYear.get(yr)) {
        leftovers.push(item);
      }
    }
  }

  // Priority 2: Cross-course pairing for leftovers (e.g. B.Tech with MBA or B.Com)
  // Ensure we don't pair same course & same year items in leftovers
  let i = 0;
  while (leftovers.length >= 2 && i < leftovers.length) {
    const itemA = leftovers[0];
    const courseA = (itemA.course_code || itemA.course_name || itemA.label.split(" ")[0] || "").trim().toUpperCase();
    const yearA = getGroupYear(itemA);

    // Find a compatible partner with different course OR different year
    const partnerIdx = leftovers.findIndex((itemB, idx) => {
      if (idx === 0) return false;
      const courseB = (itemB.course_code || itemB.course_name || itemB.label.split(" ")[0] || "").trim().toUpperCase();
      const yearB = getGroupYear(itemB);
      if (courseA && courseB && courseA === courseB && yearA && yearB && yearA === yearB) {
        return false; // same year, same course!
      }
      return true;
    });

    if (partnerIdx !== -1) {
      const itemB = leftovers.splice(partnerIdx, 1)[0];
      leftovers.shift(); // remove itemA
      streamA.push(itemA);
      streamB.push(itemB);
    } else {
      break;
    }
  }

  // Remaining leftovers cannot be alternated against each other (same course/year)
  // Put them into streamA so they are not alternated with their own batch!
  while (leftovers.length > 0) {
    const item = leftovers.shift();
    streamA.push(item);
  }

  return { streamA, streamB };
}

/**
 * Returns readable summary of pairings for the UI
 */
export function getAlternatePairingsSummary(groups) {
  const queues = groups.map((g) => ({
    label: g.label,
    course_code: g.course_code || "",
    course_name: g.course_name || "",
    batch_name: g.batch_name || "",
    items: [...(g.students || [])],
  }));
  const { streamA, streamB } = pairQueuesForAlternate(queues);
  const pairs = [];
  const maxLen = Math.max(streamA.length, streamB.length);
  for (let i = 0; i < maxLen; i++) {
    const a = streamA[i];
    const b = streamB[i];
    if (a && b) {
      const aCourse = (a.course_code || a.course_name || a.label.split(" ")[0]).trim().toUpperCase();
      const bCourse = (b.course_code || b.course_name || b.label.split(" ")[0]).trim().toUpperCase();
      const isSameCourse = aCourse === bCourse;
      pairs.push({
        batchA: a.label,
        batchB: b.label,
        isSameCourse,
        courseType: isSameCourse ? "Same Course (Diff. Years)" : "Cross-Course Fallback",
      });
    } else if (a) {
      pairs.push({
        batchA: a.label,
        batchB: "Solo",
        isSameCourse: false,
        courseType: "Single Batch",
      });
    }
  }
  return pairs;
}

/**
 * Build the seating plan.
 * @param {Array<{label:string, course_code?:string, course_name?:string, batch_name?:string, students:Array<{id:string,registration_number:string,name:string}>}>} groups
 * @param {Array<{id:string,block:string,room_number:string,row_count:number,seats_per_row:number}>} rooms
 * @param {'alternate'|'simple'|'alternate_rows'|'alternate_columns'|'column_wise'|'checkerboard'} [strategy='alternate']
 * @param {{ fillMode?: 'pack_rooms'|'balanced', alternateBatchA?: string, alternateBatchB?: string }} [options]
 * @returns {{ rooms: Array, seated: number, unseated: Array, totalCapacity: number, totalVacant: number, adjacentConflicts: number }}
 */
export function buildSeatingPlan(groups, rooms, strategy = "alternate", options = {}) {
  const queues = groups
    .map((g) => ({
      label: g.label,
      course_code: g.course_code || "",
      course_name: g.course_name || "",
      batch_name: g.batch_name || "",
      batch_id: g.batch_id || "",
      course_id: g.course_id || "",
      exam_id: g.exam_id || "",
      items: [...g.students],
    }))
    .filter((q) => q.items.length > 0);

  // Helper to identify unique batch
  const getBatchKey = (q) => q.batch_id || `${q.course_id || q.course_code || ""}_${q.batch_name || getGroupYear(q) || ""}`;
  const distinctBatchesCount = new Set(queues.map(getBatchKey)).size;

  // STRICT RULE: Alternation is NEVER allowed with the same batch!
  // If only 1 batch is present, alternate seating is impossible.
  let isAlternate = (strategy === "alternate" || strategy === "alternate_rows" || strategy === "alternate_columns");
  if (isAlternate && distinctBatchesCount < 2) {
    isAlternate = false;
  }

  // Sort rooms by total capacity descending (biggest room first)
  const usableRooms = [...rooms]
    .filter((r) => r.row_count > 0 && r.seats_per_row > 0)
    .sort((a, b) => (b.row_count * b.seats_per_row) - (a.row_count * a.seats_per_row));

  const totalStudents = queues.reduce((s, q) => s + q.items.length, 0);

  // In simple mode, sort queues by strength descending so biggest class gets biggest room
  if (!isAlternate) {
    queues.sort((a, b) => b.items.length - a.items.length);
  }

  const fillMode = options.fillMode || "pack_rooms";
  const roomTargets = fillMode === "balanced"
    ? balanceRooms(usableRooms, totalStudents)
    : packRooms(usableRooms, totalStudents);

  const planned = [];
  let adjacentConflicts = 0;

  let streamA = [];
  let streamB = [];
  let streamsList = [];

  if (isAlternate) {
    if (options.multiStreams && Array.isArray(options.multiStreams) && options.multiStreams.length >= 2) {
      // Map each stream's groups to active queues with .items
      streamsList = options.multiStreams.map((streamGroupList) => {
        const list = Array.isArray(streamGroupList) ? streamGroupList : [streamGroupList];
        const matched = [];
        for (const g of list) {
          if (!g) continue;
          if (Array.isArray(g.items)) {
            matched.push(g);
          } else {
            const found = queues.find(
              (q) => q.label === g.label || (g.label && q.label.includes(g.label))
            );
            if (found && !matched.includes(found)) {
              matched.push(found);
            } else if (Array.isArray(g.students) && g.students.length > 0) {
              const constructed = {
                label: g.label || "Group",
                course_code: g.course_code || "",
                course_name: g.course_name || "",
                batch_name: g.batch_name || "",
                batch_id: g.batch_id || "",
                course_id: g.course_id || "",
                items: [...g.students],
              };
              matched.push(constructed);
              queues.push(constructed);
            }
          }
        }
        return matched;
      });
    } else if (options.interleaveAllBatches || options.alternateBatchA === "ALL_BATCHES") {
      // High-Scale Multi-Batch Interleaving:
      // Group queues by unique batch and assign each batch to its own stream.
      // Columns cycle: Col 0: Batch 1, Col 1: Batch 2, Col 2: Batch 3...
      const batchQueuesMap = new Map();
      for (const q of queues) {
        const bKey = getBatchKey(q);
        if (!batchQueuesMap.has(bKey)) batchQueuesMap.set(bKey, []);
        batchQueuesMap.get(bKey).push(q);
      }
      if (batchQueuesMap.size >= 2) {
        streamsList = Array.from(batchQueuesMap.values());
      } else {
        isAlternate = false;
      }
    } else if (options.alternateBatchA && options.alternateBatchB) {
      // User explicitly specified which 2 batches to alternate
      const matchA = options.alternateBatchA.trim().toUpperCase();
      const matchB = options.alternateBatchB.trim().toUpperCase();

      if (matchA === matchB) {
        // STRICT RULE: Cannot alternate same batch with itself!
        isAlternate = false;
      } else {
        const leftovers = [];

        for (const q of queues) {
          const qLabel = q.label.trim().toUpperCase();
          const qCourse = (q.course_code || "").trim().toUpperCase();
          const qBatch = (q.batch_name || "").trim().toUpperCase();
          const qBatchId = (q.batch_id || "").trim().toUpperCase();
          const full = `${qCourse} ${qBatch}`.trim();

          const matchesA = qLabel.includes(matchA) || matchA.includes(qLabel) || full.includes(matchA) || matchA.includes(full) || qBatchId === matchA;
          const matchesB = qLabel.includes(matchB) || matchB.includes(qLabel) || full.includes(matchB) || matchB.includes(full) || qBatchId === matchB;

          if (matchesA && !matchesB) {
            streamA.push(q);
          } else if (matchesB && !matchesA) {
            streamB.push(q);
          } else {
            leftovers.push(q);
          }
        }

        if (streamA.length === 0 || streamB.length === 0) {
          // If either stream is empty, alternation between 2 batches is impossible!
          isAlternate = false;
        } else {
          // Leftovers: ensure same batch never enters both streams
          for (const l of leftovers) {
            const lKey = getBatchKey(l);
            const inA = streamA.some((q) => getBatchKey(q) === lKey);
            const inB = streamB.some((q) => getBatchKey(q) === lKey);
            if (inA && !inB) {
              streamA.push(l);
            } else if (inB && !inA) {
              streamB.push(l);
            } else if (!inA && !inB) {
              const countA = streamA.reduce((sum, q) => sum + q.items.length, 0);
              const countB = streamB.reduce((sum, q) => sum + q.items.length, 0);
              if (countA <= countB) streamA.push(l);
              else streamB.push(l);
            }
          }
          streamsList = [streamA, streamB];
        }
      }
    } else {
      const paired = pairQueuesForAlternate(queues);
      streamA = paired.streamA;
      streamB = paired.streamB;
      if (streamA.length > 0 && streamB.length > 0) {
        streamsList = [streamA, streamB];
      } else {
        isAlternate = false;
      }
    }
  }

  for (let ri = 0; ri < usableRooms.length; ri++) {
    const room = usableRooms[ri];
    const target = roomTargets[ri];
    const roomCapacity = room.row_count * room.seats_per_row;

    if (target <= 0 && queues.every((q) => q.items.length === 0)) {
      continue;
    }

    // Build a grid: row_count × seats_per_row
    const grid = Array.from({ length: room.row_count }, () =>
      Array.from({ length: room.seats_per_row }, () => null)
    );
    const seats = [];

    if (isAlternate && streamsList.length >= 2) {
      // --- Column-wise Alternating Seating (2 Distinct Batches) ---
      // Odd columns (Col 0, 2, 4...) -> Stream A (Batch A)
      // Even columns (Col 1, 3, 5...) -> Stream B (Batch B)
      // If one batch runs out of students, that seat remains VACANT rather than placing
      // the same batch in adjacent columns!
      const numStreams = streamsList.length;

      for (let col = 0; col < room.seats_per_row; col++) {
        if (seats.length >= target) break;

        for (let row = 0; row < room.row_count; row++) {
          if (seats.length >= target) break;

          const targetStreamIdx = col % numStreams;
          const targetStream = streamsList[targetStreamIdx];

          const found = Array.isArray(targetStream)
            ? targetStream.find((q) => q.items && q.items.length > 0)
            : (targetStream && targetStream.items && targetStream.items.length > 0 ? targetStream : null);

          if (!found) {
            // STRICT RULE: If the assigned batch for this column has no students left,
            // DO NOT put the other batch student here (which would cause same-batch students
            // to sit in adjacent columns)! Leave this seat vacant.
            continue;
          }

          const student = found.items.shift();
          if (!student) continue;

          // Check front/back in column and left/right across rows
          const above = row > 0 ? (grid[row - 1]?.[col] ?? null) : null;
          const left = col > 0 ? (grid[row]?.[col - 1] ?? null) : null;
          if (above && found.label === above) adjacentConflicts++;
          if (left && found.label === left) adjacentConflicts++;

          grid[row][col] = found.label;
          seats.push({
            room_id: room.id,
            student_id: student.id,
            row_number: row + 1,
            seat_number: col + 1,
            group_label: found.label,
            student,
            students: student,
          });
        }
      }
    } else {
      // --- Simple Sequential Seating (Column-wise) ---
      // Ek class me saare same subject ke exam wale students column-wise sequentially baithaye jayenge.
      for (let col = 0; col < room.seats_per_row; col++) {
        if (seats.length >= target) break;

        for (let row = 0; row < room.row_count; row++) {
          if (seats.length >= target) break;

          const remaining = queues.filter((q) => q.items.length > 0);
          if (remaining.length === 0) break;

          const picked = remaining[0];
          const student = picked.items.shift();
          if (!student) continue;

          const above = row > 0 ? (grid[row - 1]?.[col] ?? null) : null;
          const left = col > 0 ? (grid[row]?.[col - 1] ?? null) : null;
          if (above && picked.label === above) adjacentConflicts++;
          if (left && picked.label === left) adjacentConflicts++;

          grid[row][col] = picked.label;
          seats.push({
            room_id: room.id,
            student_id: student.id,
            row_number: row + 1,
            seat_number: col + 1,
            group_label: picked.label,
            student,
            students: student,
          });
        }
      }
    }

    if (seats.length > 0) {
      const vacant = Math.max(0, roomCapacity - seats.length);
      planned.push({
        room,
        seats,
        used: seats.length,
        capacity: roomCapacity,
        vacant,
        isFull: seats.length >= roomCapacity,
      });
    }
  }

  // Any remaining students that couldn't fit in selected rooms
  const unseated = queues.flatMap((q) =>
    q.items.map((s) => ({
      student_id: s.id,
      registration_number: s.registration_number,
      group_label: q.label,
    }))
  );

  const totalCapacity = usableRooms.reduce((s, r) => s + r.row_count * r.seats_per_row, 0);
  const totalSeated = planned.reduce((s, r) => s + r.used, 0);

  return {
    rooms: planned,
    seated: totalSeated,
    unseated,
    totalCapacity,
    totalVacant: Math.max(0, totalCapacity - totalSeated),
    adjacentConflicts,
  };
}

/**
 * Column-major order: fill column 0 top-to-bottom, then column 1, etc.
 */
function columnMajorOrder(room) {
  const order = [];
  for (let col = 0; col < room.seats_per_row; col++) {
    for (let row = 0; row < room.row_count; row++) {
      order.push([row, col]);
    }
  }
  return order;
}

/** Row-major order */
function rowMajorOrder(room) {
  const order = [];
  for (let row = 0; row < room.row_count; row++) {
    for (let col = 0; col < room.seats_per_row; col++) {
      order.push([row, col]);
    }
  }
  return order;
}

/**
 * Pack Rooms (Fill rooms completely 100%, leave only the last room with vacant seats).
 * Example: 80 students, 4 rooms of 36 cap -> [36, 36, 8, 0]
 */
export function packRooms(rooms, totalStudents) {
  const capacities = rooms.map((r) => r.row_count * r.seats_per_row);
  const targets = [];
  let remaining = totalStudents;

  for (let i = 0; i < capacities.length; i++) {
    if (remaining <= 0) {
      targets.push(0);
    } else {
      const take = Math.min(capacities[i], remaining);
      targets.push(take);
      remaining -= take;
    }
  }

  return targets;
}

/**
 * Balanced room allocation.
 * Distributes totalStudents proportionally across rooms.
 */
export function balanceRooms(rooms, totalStudents) {
  const capacities = rooms.map((r) => r.row_count * r.seats_per_row);
  const totalCap = capacities.reduce((s, c) => s + c, 0);

  if (totalStudents >= totalCap) {
    return capacities.slice();
  }

  const raw = capacities.map((cap) => (totalStudents * cap) / totalCap);
  const floored = raw.map(Math.floor);
  let remainder = totalStudents - floored.reduce((s, x) => s + x, 0);

  const fractions = raw
    .map((x, i) => ({ i, frac: x - floored[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    floored[fractions[k].i]++;
  }

  return floored.map((t, i) => Math.min(t, capacities[i]));
}

/**
 * Generate a printable seating grid for a room.
 * Returns a 2D array of { row, col, student | null, group_label | null, isVacant: boolean }
 */
export function buildRoomGrid(seats, rowCount, seatsPerRow) {
  const grid = Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: seatsPerRow }, (_, col) => ({
      row: row + 1,
      col: col + 1,
      student: null,
      group_label: null,
      isVacant: true,
    }))
  );

  for (const seat of seats) {
    const rowIdx = seat.row_number - 1;
    const colIdx = seat.seat_number - 1;
    if (grid[rowIdx] && grid[rowIdx][colIdx]) {
      const studentObj = seat.student ?? seat.students ?? null;
      grid[rowIdx][colIdx].student = studentObj;
      grid[rowIdx][colIdx].group_label = seat.group_label;
      grid[rowIdx][colIdx].isVacant = !studentObj;
    }
  }

  return grid;
}
