/**
 * The only `sms_subjects` columns a Department Head (migration 216) may change
 * on a subject they head. The database column guard refuses any other change
 * by a Department Head-only caller; this twin keeps the update payload inside
 * that line so a save is never refused and the form never offers more than
 * the database allows.
 */
export const DEPARTMENT_HEAD_EDITABLE_SUBJECT_FIELDS = [
  "code",
  "name",
  "description",
] as const;

export function pickDepartmentHeadSubjectUpdate<
  T extends Record<string, unknown>,
>(payload: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of DEPARTMENT_HEAD_EDITABLE_SUBJECT_FIELDS) {
    if (key in payload) out[key as keyof T] = payload[key as keyof T];
  }
  return out;
}
