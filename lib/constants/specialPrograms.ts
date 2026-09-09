// Special curricular programs and their specialisations (migration 179).
//
// A SECOND AXIS, NOT A FOURTH `program` VALUE. `sms_subjects.program` (133) is
// the curriculum stream — regular | madrasah | als — CHECK-constrained because
// each value carries behaviour: it drives `is_madrasah` through a trigger, and
// 136 pairs ALS subjects to ALS sections. A special program is orthogonal to
// all of that, and it is school-configurable, which a CHECK constraint can
// never be. So an SPA Music subject is:
//
//   program             = 'regular'      — not MEP, not ALS
//   special_program_id  = SPA
//   specialization_id   = Music
//   selective_enrolment = true | false   — independent of all three
//
// `program = 'regular'` there means "not Madrasah, not ALS". It does not mean
// "not special". The two are labelled "Curriculum Program" and "Special
// Program" in the UI so a registrar never sees two dropdowns called Program.
//
// NOTHING IS HARD-CODED HERE. Unlike MAPEH's two components or EPP/TLE's four,
// the programs themselves live in the database: the division office maintains
// the national list (SPA, SPS, SPFL, STE, …) as rows with a NULL school_id,
// and a school may add its own. This file holds only the shapes and the
// helpers that read them.

/**
 * A special curricular program. `school_id` NULL is a division-wide master row
 * usable by every school (the 106/118/125 convention); set means that school's
 * own program.
 */
export interface SpecialProgram {
  id: string;
  school_id?: string | null;
  code: string;
  name: string;
  /**
   * What this program calls its second level: "Area of Specialization" (SPA),
   * "Sport" (SPS), "Language" (SPFL). Programs do not share one hierarchy, and
   * a label is cheaper than a per-program branch.
   */
  specialization_label: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * A strand within a program. Optional by design — STE and SPJ have no second
 * level at all, and a program with no rows here simply hides the picker.
 */
export interface SpecialProgramSpecialization {
  id: string;
  special_program_id: string;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * A learner's MEMBERSHIP of a program for a school year.
 *
 * This is NOT a subject roster. Membership says "Juan is an SPA-Music learner
 * this year"; the roster (`sms_student_subjects`) says "Juan takes SPA Music 7
 * in section 7-Rizal". Membership never creates roster rows — it only prefills
 * the roster modal, one way, on demand, writing nothing until Save.
 *
 * `specialization_id` is nullable: a program may have no second level, or a
 * learner may be admitted before their strand is settled.
 */
export interface StudentSpecialProgram {
  id: string;
  student_id: string;
  special_program_id: string;
  specialization_id?: string | null;
  school_id: string;
  school_year: string;
  enrolled_at?: string;
  enrolled_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Fallback for a program that has not set its own second-level term. */
export const DEFAULT_SPECIALIZATION_LABEL = "Specialization";

export const specializationLabel = (
  program: Pick<SpecialProgram, "specialization_label"> | null | undefined,
): string => program?.specialization_label?.trim() || DEFAULT_SPECIALIZATION_LABEL;

/** True when the row is the division office's, shared by every school. */
export const isDivisionWideProgram = (
  program: Pick<SpecialProgram, "school_id">,
): boolean => program.school_id == null;

/**
 * The programs a school may tag a subject with: its own, plus every
 * division-wide one. Retired programs are kept resolvable but not offered.
 */
export function selectableProgramsFor(
  programs: SpecialProgram[],
  schoolId: string | number | null | undefined,
): SpecialProgram[] {
  const school = schoolId == null ? null : String(schoolId);
  return programs
    .filter((p) => p.is_active)
    .filter((p) => p.school_id == null || (school != null && String(p.school_id) === school))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The active strands of one program, in name order. */
export function specializationsOf(
  specializations: SpecialProgramSpecialization[],
  programId: string | null | undefined,
): SpecialProgramSpecialization[] {
  if (!programId) return [];
  return specializations
    .filter((s) => String(s.special_program_id) === String(programId) && s.is_active)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * How a tagged subject reads on a badge: the strand when there is one, the
 * program otherwise. Manage Schedules is tight on width, so the short form is
 * the code and the full name belongs in the tooltip.
 */
export function specialProgramBadge(
  subject: {
    special_program_id?: string | null;
    specialization_id?: string | null;
  },
  programs: SpecialProgram[],
  specializations: SpecialProgramSpecialization[],
): { short: string; full: string } | null {
  if (!subject.special_program_id) return null;

  const program = programs.find(
    (p) => String(p.id) === String(subject.special_program_id),
  );
  if (!program) return null;

  const strand = subject.specialization_id
    ? specializations.find(
        (s) => String(s.id) === String(subject.specialization_id),
      )
    : undefined;

  return strand
    ? { short: strand.code, full: `${program.name} — ${strand.name}` }
    : { short: program.code, full: program.name };
}

/**
 * Whether a subject carries a per-learner roster.
 *
 * GENERIC BY DESIGN. It is true of Madrasah and ALS (migration 179 backfilled
 * it from `is_madrasah`, and a trigger keeps it forced on for them), and it is
 * settable on anything else — an SPA strand subject, an EPP/TLE component, a
 * plain elective. There is deliberately no per-program branch here and none
 * anywhere else: `is_tle_selective` and its cousins do not exist.
 *
 * It says NOTHING about the general average. That is still `is_madrasah`.
 */
export function isSelectiveSubject(subject: {
  selective_enrolment?: boolean | null;
  is_madrasah?: boolean | null;
}): boolean {
  // The || is for rows read before 179 is applied, not for the rule: the
  // database forces the flag on for madrasah, so the two agree in practice.
  return !!subject.selective_enrolment || !!subject.is_madrasah;
}

/**
 * The notice a selective subject shows while its roster is empty.
 *
 * An empty roster must never look like a normal state: for a subject the whole
 * section takes, nobody being listed means "everybody"; for a selective one it
 * means nobody can be graded at all. The two look identical until somebody
 * opens the grade sheet in December.
 */
export const SELECTIVE_EMPTY_ROSTER_NOTICE =
  "Selective enrollment is enabled. Students must be assigned to this subject before grades can be entered.";
