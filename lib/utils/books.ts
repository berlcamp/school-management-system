interface StudentName {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
}

/** Format student name as "Last, First Middle Suffix" */
export function formatStudentName(student: StudentName | null | undefined): string {
  if (!student) return "—";
  const { last_name, first_name, middle_name, suffix } = student;
  return `${last_name}, ${first_name}${middle_name ? ` ${middle_name}` : ""}${suffix ? ` ${suffix}` : ""}`.trim();
}

/** Format a date string in en-PH locale (e.g., "Mar 31, 2026") */
export function formatDatePH(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface IssuanceForAvailability {
  book_id: string | number;
  date_returned?: string | null;
  returned_to_manager_at?: string | null;
}

interface AllocationForAvailability {
  id: string;
  quantity: number;
  book: { id: string; title: string; subject_area: string; grade_level: number } | null;
}

export interface BookAvailabilityRow {
  allocationId: string;
  bookId: string;
  title: string;
  subjectArea: string;
  gradeLevel: number;
  quantity: number;
  withStudents: number;
  held: number;
  available: number;
}

export interface BookAvailabilitySummary {
  totalAllocated: number;
  withStudents: number;
  held: number;
  available: number;
}

/** Calculate per-book availability from allocations and issuances */
export function calculateBookAvailability(
  allocations: AllocationForAvailability[],
  issuances: IssuanceForAvailability[],
): { rows: BookAvailabilityRow[]; summary: BookAvailabilitySummary } {
  const byBook: Record<string, { withStudents: number; held: number }> = {};
  for (const i of issuances) {
    const bid = String(i.book_id);
    if (!byBook[bid]) byBook[bid] = { withStudents: 0, held: 0 };
    if (i.date_returned == null) {
      byBook[bid].withStudents += 1;
    } else if (i.returned_to_manager_at == null) {
      byBook[bid].held += 1;
    }
  }

  const rows: BookAvailabilityRow[] = [];
  let totalWithStudents = 0;
  let totalHeld = 0;
  let totalAvailable = 0;

  for (const alloc of allocations) {
    const book = Array.isArray(alloc.book) ? alloc.book[0] : alloc.book;
    if (!book) continue;

    const bookId = String(book.id);
    const quantity = alloc.quantity;
    const counts = byBook[bookId] ?? { withStudents: 0, held: 0 };
    const withStudents = counts.withStudents;
    const held = counts.held;
    const available = quantity - withStudents;

    totalWithStudents += withStudents;
    totalHeld += held;
    totalAvailable += available;

    rows.push({
      allocationId: String(alloc.id),
      bookId,
      title: book.title,
      subjectArea: book.subject_area ?? "",
      gradeLevel: book.grade_level ?? 0,
      quantity,
      withStudents,
      held,
      available,
    });
  }

  return {
    rows,
    summary: {
      totalAllocated: rows.reduce((s, r) => s + r.quantity, 0),
      withStudents: totalWithStudents,
      held: totalHeld,
      available: totalAvailable,
    },
  };
}

/** Extract effective school ID string from user object */
export function getEffectiveSchoolId(user: { school_id?: string | number | null } | null): string {
  return user?.school_id != null ? String(user.school_id) : "";
}
