// Subject program taxonomy (migration 133).
//
// `program` is the source of truth; `sms_subjects.is_madrasah` is derived from
// it by a database trigger and still carries the two behaviours it has meant
// since 034 — selective per-learner enrolment via sms_student_subjects, and
// exclusion from the general average. Both madrasah and ALS are selective.

export type SubjectProgram = "regular" | "madrasah" | "als";

export const SUBJECT_PROGRAMS: {
  value: SubjectProgram;
  label: string;
  /** Spelled out, for the dropdown only */
  description: string;
  /** Compact form for badges beside a subject code */
  short: string;
  /** Only listed learners take the subject, and it is out of the average */
  selective: boolean;
}[] = [
  {
    value: "regular",
    label: "Regular",
    description: "Taken by every learner in the section",
    short: "Regular",
    selective: false,
  },
  {
    value: "madrasah",
    label: "Madrasah (MEP)",
    description: "Madrasah Education Program",
    short: "MEP",
    selective: true,
  },
  {
    value: "als",
    label: "ALS",
    description: "Alternative Learning System",
    short: "ALS",
    selective: true,
  },
];

/**
 * Resolve the stored program of a subject. Rows written before 133 have no
 * `program`, so fall back to the boolean they do have.
 */
export function getSubjectProgram(subject: {
  program?: string | null;
  is_madrasah?: boolean | null;
}): SubjectProgram {
  const stored = subject.program;
  if (stored && SUBJECT_PROGRAMS.some((p) => p.value === stored)) {
    return stored as SubjectProgram;
  }
  return subject.is_madrasah ? "madrasah" : "regular";
}

export const getSubjectProgramLabel = (program: SubjectProgram): string =>
  SUBJECT_PROGRAMS.find((p) => p.value === program)?.label ?? program;

export const getSubjectProgramDescription = (program: SubjectProgram): string =>
  SUBJECT_PROGRAMS.find((p) => p.value === program)?.description ?? "";

export const getSubjectProgramShortLabel = (program: SubjectProgram): string =>
  SUBJECT_PROGRAMS.find((p) => p.value === program)?.short ?? program;

/** True when only explicitly enrolled learners take the subject */
export const isSelectiveProgram = (program: SubjectProgram): boolean =>
  SUBJECT_PROGRAMS.find((p) => p.value === program)?.selective ?? false;
