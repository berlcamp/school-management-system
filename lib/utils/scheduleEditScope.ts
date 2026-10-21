/**
 * What a staff designee (migration 216) may do with a schedule or a section.
 *
 * A Department Head writes schedules of the subjects they head in full (insert,
 * update, delete). A Grade Level Coordinator may only change the teacher of a
 * schedule — plus the 124 conflict override a teacher change may need — in a
 * section of a grade level they cover, and only the adviser of such a section.
 * A row whose subject the person heads takes the Department Head rules even
 * when they are also its Grade Level Coordinator.
 *
 * The database refuses the rest (RLS plus `sms_schedules_glc_column_guard`);
 * these twins keep the forms and payloads inside that line so a save is never
 * refused. `sms_sections` writes are open in the database (001), so the
 * section adviser limit lives here only.
 */

/** "full" = unchanged behaviour; "teacher_only" = GLC; "none" = read-only. */
export type ScheduleEditMode = "full" | "teacher_only" | "none";

export function scheduleEditMode({
  designeeOnly,
  headsSubject,
  coversGrade,
}: {
  /** Holds a relevant designation and no subject-roster role (ruling R1). */
  designeeOnly: boolean;
  headsSubject: boolean;
  coversGrade: boolean;
}): ScheduleEditMode {
  if (!designeeOnly) return "full";
  if (headsSubject) return "full";
  if (coversGrade) return "teacher_only";
  return "none";
}

export const GRADE_LEVEL_COORDINATOR_SCHEDULE_FIELDS = [
  "teacher_id",
  "conflict_override",
] as const;

export const GRADE_LEVEL_COORDINATOR_SECTION_FIELDS = [
  "section_adviser_id",
] as const;

function pick<T extends Record<string, unknown>>(
  payload: T,
  keys: readonly string[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of keys) {
    if (key in payload) out[key as keyof T] = payload[key as keyof T];
  }
  return out;
}

export function pickGradeLevelCoordinatorScheduleUpdate<
  T extends Record<string, unknown>,
>(payload: T): Partial<T> {
  return pick(payload, GRADE_LEVEL_COORDINATOR_SCHEDULE_FIELDS);
}

export function pickGradeLevelCoordinatorSectionUpdate<
  T extends Record<string, unknown>,
>(payload: T): Partial<T> {
  return pick(payload, GRADE_LEVEL_COORDINATOR_SECTION_FIELDS);
}
