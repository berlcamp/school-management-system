import { GpaThresholds, sectionTypeMatchesGpa } from "./gpaThresholds";
import { SectionType } from "@/types";

export interface SectionCandidate {
  id: string;
  name: string;
  sectionType: SectionType | null;
  maxStudents: number | null;
  enrolledCount: number;
}

/**
 * Auto-assigns a section for a student based on GPA and section thresholds.
 * Returns the section ID or null if no section is available.
 *
 * Logic:
 * 1. Filter out full sections
 * 2. Find sections matching the student's GPA-based section type
 * 3. Pick the least-full matching section
 * 4. If no match, fall back to the least-full available section
 */
export function autoAssignSection(
  gpa: number | null,
  sections: SectionCandidate[],
  thresholds: GpaThresholds,
  countOverrides?: Map<string, number>
): string | null {
  const available = sections.filter((s) => {
    const count = countOverrides?.get(s.id) ?? s.enrolledCount;
    return s.maxStudents == null || count < s.maxStudents;
  });

  if (available.length === 0) return null;

  // Filter by GPA-based section type match
  const matching = available
    .filter((s) => sectionTypeMatchesGpa(s.sectionType, gpa, thresholds))
    .sort((a, b) => {
      const countA = countOverrides?.get(a.id) ?? a.enrolledCount;
      const countB = countOverrides?.get(b.id) ?? b.enrolledCount;
      return countA - countB;
    });

  if (matching.length > 0) return matching[0].id;

  // Fallback: least-full section regardless of type
  const fallback = [...available].sort((a, b) => {
    const countA = countOverrides?.get(a.id) ?? a.enrolledCount;
    const countB = countOverrides?.get(b.id) ?? b.enrolledCount;
    return countA - countB;
  });

  return fallback[0].id;
}

/**
 * Batch auto-assign sections for multiple students.
 * Maintains an in-memory count tracker so each assignment increments
 * the count, preventing over-assignment to a single section.
 */
export function batchAutoAssignSections(
  students: Array<{ studentId: string; gpa: number | null }>,
  sections: SectionCandidate[],
  thresholds: GpaThresholds
): Map<string, string> {
  const assignments = new Map<string, string>();
  const countOverrides = new Map<string, number>();

  // Initialize counts from current enrolled counts
  for (const s of sections) {
    countOverrides.set(s.id, s.enrolledCount);
  }

  for (const student of students) {
    const sectionId = autoAssignSection(
      student.gpa,
      sections,
      thresholds,
      countOverrides
    );

    if (sectionId) {
      assignments.set(student.studentId, sectionId);
      // Increment in-memory count
      countOverrides.set(sectionId, (countOverrides.get(sectionId) ?? 0) + 1);
    }
  }

  return assignments;
}
