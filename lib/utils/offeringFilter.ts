// Pure filter for Senior High term offerings (migration 235). No Supabase
// import, so a server action (lib/student-portal/actions.ts) can use it.

export interface OfferingRow {
  section_id: string | number;
  subject_id: string | number;
  school_year: string;
  terms: number[];
}

/**
 * Grades with any that sit outside their subject's offering (in their own
 * section and school year) removed — for readers that list a learner's grades
 * across sections and years, such as the student portal.
 */
export function withinOfferings<
  T extends {
    section_id: string | number;
    subject_id: string | number;
    school_year: string;
    grading_period: number;
  },
>(grades: T[], offerings: OfferingRow[]): T[] {
  const key = (r: { section_id: string | number; subject_id: string | number; school_year: string }) =>
    `${r.section_id}:${r.subject_id}:${r.school_year}`;
  const terms = new Map(offerings.map((o) => [key(o), o.terms.map(Number)]));
  return grades.filter((g) => {
    const offered = terms.get(key(g));
    return !offered || offered.includes(Number(g.grading_period));
  });
}
