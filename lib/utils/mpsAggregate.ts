/**
 * Derives MPS from exam results (Item Analysis). Moved out of the /mps page so
 * the department head's coverage dashboard computes exactly the same figures.
 * `sms_mps` is not used: MPS is always derived from `sms_exam_results`.
 */

export interface ExamResultSectionRef {
  id: number | string;
  name: string;
  grade_level: number;
}

export interface ExamResultTosRef {
  subject_name: string;
  subject_id?: number | string | null;
  grade_level: number;
  grading_period: number;
}

type MaybeArray<T> = T | T[] | null;

/** One `sms_exam_results` row with its embedded section / exam / TOS joins. */
export interface ExamResultRow {
  id: number | string;
  mps: number | string | null;
  total_items: number | string;
  exam_id: number | string;
  section_id: number | string;
  section: MaybeArray<ExamResultSectionRef>;
  exam: MaybeArray<{ tos: MaybeArray<ExamResultTosRef> }>;
}

/** Select string that yields `ExamResultRow`. */
export const EXAM_RESULT_SELECT =
  "id, mps, total_items, exam_id, section_id, section:section_id(id, name, grade_level), exam:exam_id!inner(tos:tos_id!inner(subject_name, subject_id, grade_level, grading_period))";

export type MpsGroup = {
  subjectName: string;
  subjectId: string | null;
  sectionId: string;
  gradeLevel: number;
  period: number;
  mps: number;
};

export interface MpsResultRef {
  resultId: string;
  examId: string;
  subjectName: string;
  gradeLevel: number;
  quarter: number;
  sectionName: string;
}

/** One MPS per subject name + section + period, averaged across exam versions. */
export interface ExamMpsGroup {
  key: string;
  subjectName: string;
  subjectId: string | null;
  section: { id: string; name: string; grade_level: number } | null;
  sectionId: string;
  gradeLevel: number;
  quarter: number;
  mps: number;
  /** Male / female MPS, averaged across exam versions like `mps`; null = none sat it. */
  mpsMale: number | null;
  mpsFemale: number | null;
  /** The exam results pooled into this MPS. */
  results: MpsResultRef[];
}

function one<T>(value: MaybeArray<T> | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function avg(values: Array<number | null | undefined>): number | null {
  const present = values.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );
  if (present.length === 0) return null;
  return present.reduce((acc, v) => acc + v, 0) / present.length;
}

/**
 * Group results by (TOS subject name, section, grading period) and average.
 * `sexSplit` optionally supplies the male / female MPS of one result.
 */
export function groupExamResults(
  rows: ExamResultRow[],
  sexSplit?: (row: ExamResultRow) => {
    male: number | null;
    female: number | null;
  }
): ExamMpsGroup[] {
  const groups = new Map<
    string,
    Omit<ExamMpsGroup, "key" | "mps" | "mpsMale" | "mpsFemale"> & {
      values: number[];
      male: number[];
      female: number[];
    }
  >();
  rows.forEach((r) => {
    if (r.mps == null) return;
    const exam = one(r.exam);
    const tos = exam ? one(exam.tos) : null;
    if (!tos) return;
    const sectionRaw = one(r.section);
    const subjectName = tos.subject_name;
    const quarter = tos.grading_period;
    const gradeLevel = sectionRaw?.grade_level ?? tos.grade_level;
    const key = `${subjectName}__${r.section_id}__${quarter}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        subjectName,
        subjectId: tos.subject_id != null ? String(tos.subject_id) : null,
        section: sectionRaw
          ? {
              id: String(sectionRaw.id),
              name: sectionRaw.name,
              grade_level: sectionRaw.grade_level,
            }
          : null,
        sectionId: String(r.section_id),
        gradeLevel,
        quarter,
        values: [],
        male: [],
        female: [],
        results: [],
      };
      groups.set(key, g);
    }
    g.values.push(Number(r.mps));
    const split = sexSplit?.(r);
    if (split?.male != null) g.male.push(split.male);
    if (split?.female != null) g.female.push(split.female);
    g.results.push({
      resultId: String(r.id),
      examId: String(r.exam_id),
      subjectName,
      gradeLevel,
      quarter,
      sectionName: g.section?.name ?? "Unknown section",
    });
  });

  return Array.from(groups.entries()).map(([key, g]) => ({
    key,
    subjectName: g.subjectName,
    subjectId: g.subjectId,
    section: g.section,
    sectionId: g.sectionId,
    gradeLevel: g.gradeLevel,
    quarter: g.quarter,
    mps: g.values.reduce((a, v) => a + v, 0) / g.values.length,
    mpsMale: avg(g.male),
    mpsFemale: avg(g.female),
    results: g.results,
  }));
}

/** MPS per subject × section × grading period, from exam results. */
export function aggregateExamMps(rows: ExamResultRow[]): MpsGroup[] {
  return groupExamResults(rows).map((g) => ({
    subjectName: g.subjectName,
    subjectId: g.subjectId,
    sectionId: g.sectionId,
    gradeLevel: g.gradeLevel,
    period: g.quarter,
    mps: g.mps,
  }));
}
