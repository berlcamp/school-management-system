// Enrollment → Change section: moving a learner to another section of the
// same grade during the school year. The move is 183's `correct_enrollment`;
// the earlier section's grades and attendance stay where they were encoded and
// still print on the card (lib/utils/learnerYearRecords.ts, migration 234).

/** Only a learner currently sitting in a section can change section. */
export function canChangeSection(row: {
  status: string;
  enrollment_status: string;
}): boolean {
  return row.status === "approved" && row.enrollment_status === "active";
}

/**
 * The reason sent to `correct_enrollment`, which appends it to the remarks as
 * "Corrected <date>: …". Null until the registrar types one — it is required.
 */
export function sectionChangeReason(
  fromSectionName: string,
  reason: string,
): string | null {
  const typed = reason.trim();
  if (!typed) return null;
  return `Section change from ${fromSectionName}: ${typed}`;
}

/** How many subjects carry an encoded grade (> 0) in each grading period. */
export function gradedSubjectsByPeriod(
  rows: Array<{ subject_id: string | number; grading_period: number; grade: number }>,
): Array<{ period: number; subjects: number }> {
  const byPeriod = new Map<number, Set<string>>();
  for (const row of rows) {
    if (Number(row.grade) <= 0) continue;
    const period = Number(row.grading_period);
    if (!byPeriod.has(period)) byPeriod.set(period, new Set());
    byPeriod.get(period)!.add(String(row.subject_id));
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => a - b)
    .map(([period, subjects]) => ({ period, subjects: subjects.size }));
}

/**
 * Subjects scheduled in the old section but not in the new one. Their earlier
 * grades still print, on a line of their own — the case of a school that keeps
 * a separate subject row per section.
 */
export function subjectsOnlyIn(
  oldSubjectIds: string[],
  newSubjectIds: string[],
): string[] {
  const inNew = new Set(newSubjectIds.map(String));
  return [...new Set(oldSubjectIds.map(String))].filter((id) => !inNew.has(id));
}
